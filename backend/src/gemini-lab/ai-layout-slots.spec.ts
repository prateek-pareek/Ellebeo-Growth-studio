import sharp from 'sharp';
import { detectSlots, detectSlot, buildLayoutPrompt, composeWithPhoto } from './ai-layout';

/**
 * Finding the photo slots the model left on its own design.
 *
 * The model designs the page around flat magenta rectangles and never sees the
 * client, because a model handed a real photograph returns a different person
 * (22-37% mean pixel difference against a 0.2% noise floor). Whatever it leaves
 * behind, we have to find.
 *
 * `detectSlot` took the extent of every placeholder pixel at once, which is
 * correct for one rectangle and fails two different ways for two — the bounding
 * box of a pair covers both rectangles AND the gap between them:
 *
 *   narrow gap → the box is still ~91% filled, so it is ACCEPTED, and one photo
 *                is pasted across both frames and the design between them
 *   wide gap   → the box falls under the 75% threshold and the whole page is
 *                REJECTED as "not a clean rectangle"
 *
 * Measured on real runs, the rejection alone lost about one page in six. It is
 * also why the AI-layout path was switched off for before-and-after posts
 * entirely — the posts that then scored 60 on the composited path, while the
 * fully generated path scored 80.
 */

const MAGENTA = { r: 255, g: 0, b: 255 };
const W = 1080;
const H = 1350;

/** A page with `rects` magenta placeholders on a plain ground. */
async function page(rects: Array<{ x: number; y: number; w: number; h: number }>): Promise<Buffer> {
  const blocks = await Promise.all(
    rects.map((r) =>
      sharp({ create: { width: r.w, height: r.h, channels: 3, background: MAGENTA } }).png().toBuffer(),
    ),
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 240, g: 235, b: 225 } } })
    .composite(blocks.map((input, i) => ({ input, left: rects[i].x, top: rects[i].y })))
    .png()
    .toBuffer();
}

describe('finding one slot', () => {
  it('finds a single placeholder and its position', async () => {
    const out = await detectSlots(await page([{ x: 100, y: 200, w: 600, h: 700 }]));
    expect(out.slots).toHaveLength(1);
    const s = out.slots[0];
    expect(s.x).toBeCloseTo(100, -1);
    expect(s.y).toBeCloseTo(200, -1);
    expect(s.w).toBeCloseTo(600, -1);
    expect(s.h).toBeCloseTo(700, -1);
  });

  it('agrees with the original single-slot detector', async () => {
    const png = await page([{ x: 120, y: 160, w: 700, h: 800 }]);
    const one = await detectSlot(png);
    const many = await detectSlots(png);
    expect(one.slot).not.toBeNull();
    expect(many.slots[0].x).toBe(one.slot!.x);
    expect(many.slots[0].w).toBe(one.slot!.w);
  });
});

describe('finding a pair of slots', () => {
  const pair = [
    { x: 80, y: 300, w: 420, h: 560 },
    { x: 580, y: 300, w: 420, h: 560 },
  ];

  it('finds BOTH placeholders side by side', async () => {
    const out = await detectSlots(await page(pair));
    expect(out.slots).toHaveLength(2);
  });

  it('is the case the old detector silently MERGED', async () => {
    // Worse than a rejection. With a modest gap the pair's bounding box is
    // still 91% filled, so the old detector accepted it and returned ONE slot
    // spanning both rectangles AND the design between them — a single photo
    // pasted straight across the middle of the model's page.
    const png = await page(pair);
    const old = await detectSlot(png);
    expect(old.slot).not.toBeNull();
    expect(old.slot!.w).toBeGreaterThan(900); // both frames plus the gap
    // Each real frame is only 420 wide.
    expect((await detectSlots(png)).slots.map((s) => s.w)).toEqual([420, 420]);
  });

  it('rejects a widely spaced pair outright, rather than merging it', async () => {
    // The other half of the same bug: open the gap and rectangularity falls
    // below the threshold, so the whole page was thrown away instead.
    const wide = [
      { x: 40, y: 300, w: 300, h: 560 },
      { x: 740, y: 300, w: 300, h: 560 },
    ];
    const png = await page(wide);
    expect((await detectSlot(png)).slot).toBeNull();
    expect((await detectSlots(png)).slots).toHaveLength(2);
  });

  it('returns them in reading order, left before right', async () => {
    const out = await detectSlots(await page(pair));
    expect(out.slots[0].x).toBeLessThan(out.slots[1].x);
  });

  it('returns a stacked pair top before bottom', async () => {
    const out = await detectSlots(await page([
      { x: 200, y: 620, w: 680, h: 400 },
      { x: 200, y: 140, w: 680, h: 400 },
    ]));
    expect(out.slots).toHaveLength(2);
    expect(out.slots[0].y).toBeLessThan(out.slots[1].y);
  });
});

describe('refusing what is not a slot', () => {
  it('reports an empty page rather than inventing a slot', async () => {
    const out = await detectSlots(await page([]));
    expect(out.slots).toEqual([]);
    expect(out.reason).toMatch(/no placeholder/);
  });

  it('ignores antialiasing speckle around a real slot', async () => {
    const out = await detectSlots(await page([
      { x: 100, y: 200, w: 600, h: 700 },
      { x: 900, y: 60, w: 3, h: 3 },
      { x: 950, y: 90, w: 2, h: 2 },
    ]));
    expect(out.slots).toHaveLength(1);
    expect(out.slots[0].w).toBeCloseTo(600, -1);
  });

  it('refuses a sliver too small to be the photograph', async () => {
    const out = await detectSlots(await page([{ x: 40, y: 40, w: 60, h: 90 }]));
    expect(out.slots).toEqual([]);
  });

  it('never returns more slots than asked for', async () => {
    const out = await detectSlots(
      await page([
        { x: 40, y: 100, w: 300, h: 400 },
        { x: 380, y: 100, w: 300, h: 400 },
        { x: 720, y: 100, w: 300, h: 400 },
      ]),
      { maxSlots: 2 },
    );
    expect(out.slots).toHaveLength(2);
  });
});

describe('what the page is asked for', () => {
  const base = {
    copy: { headline: 'Lived-in blonde', subhead: 'Grown out, not grown tired.' },
    brand: {
      name: 'Lok Salon',
      palette: { background: '#F3EDE3', depth: '#3F4A3C', accent: '#A3B18A', secondary: '#D8C3A5', primary: '#6B705C' },
      typography: { heading: 'Playfair Display', body: 'Inter' },
      mood: 'quiet_luxury',
    },
    aspectRatio: '4:5',
  } as any;

  it('asks for one placeholder by default, exactly as before', () => {
    const p = buildLayoutPrompt(base);
    expect(p).toMatch(/THE PHOTOGRAPH AREA/);
    expect(p).not.toMatch(/TWO PHOTOGRAPH AREAS/);
  });

  it('asks for two matched placeholders for a pair', () => {
    const p = buildLayoutPrompt({ ...base, photoCount: 2 });
    expect(p).toMatch(/TWO PHOTOGRAPH AREAS/);
    // Same size and a real gap: unequal frames read as decoration, and
    // touching frames cannot be told apart once the photos are in.
    expect(p).toMatch(/EXACTLY the same size/i);
    expect(p).toMatch(/gap/i);
    expect(p).toMatch(/must not touch/i);
  });

  it('does not let the model letter the pair itself', () => {
    // The labels are drawn afterwards, from what was actually placed. A model
    // that writes them guesses, and a post captioned BEFORE over the finished
    // hair is worse than no caption at all.
    expect(buildLayoutPrompt({ ...base, photoCount: 2 })).toMatch(/Do NOT write the words/i);
  });

  it('still forbids drawing people on either variant', () => {
    // The whole reason for placeholders: a model handed a client's photo
    // returns a different person.
    for (const photoCount of [1, 2]) {
      expect(buildLayoutPrompt({ ...base, photoCount })).toMatch(/Do NOT draw any people/i);
    }
  });

  it('never leaks a hex code or a typeface name, for either variant', () => {
    for (const photoCount of [1, 2]) {
      const p = buildLayoutPrompt({ ...base, photoCount });
      // #FF00FF is the placeholder instruction and belongs here. What must
      // never appear is the BRAND's own values — handed those, the model has
      // typeset them as visible copy on the finished page.
      for (const hex of Object.values(base.brand.palette) as string[]) {
        expect(p).not.toContain(hex);
      }
      expect(p).not.toMatch(/Playfair|Inter\b/);
    }
  });
});

describe('padding a page to the canvas', () => {
  /** A page with a thick border, on a pale ground — what the model often draws. */
  async function borderedPage(): Promise<Buffer> {
    const inner = await sharp({
      create: { width: 900, height: 900, channels: 3, background: { r: 250, g: 240, b: 232 } },
    }).png().toBuffer();
    return sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 140, g: 30, b: 60 } } })
      .composite([{ input: inner, left: 50, top: 50 }])
      .png()
      .toBuffer();
  }

  it('pads with the page ground, not the border it happens to be framed in', async () => {
    // Sampling the corner put the BORDER colour in the pad, which rendered as
    // thick maroon bands across the top and bottom of a finished post.
    const out = await composeWithPhoto({
      page: await borderedPage(),
      photo: await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } } }).jpeg().toBuffer(),
      slot: { x: 200, y: 200, w: 400, h: 400 },
      aspectRatio: '4:5',
    });

    // The pad lands at the very top of the 4:5 canvas, above the square page.
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (4 * info.width + Math.floor(info.width / 2)) * info.channels;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Pale ground, not the dark maroon border.
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(190);
    expect(Math.abs(r - 140) + Math.abs(g - 30) + Math.abs(b - 60)).toBeGreaterThan(150);
  });

  it('returns the pipeline canvas size', async () => {
    const out = await composeWithPhoto({
      page: await borderedPage(),
      photo: await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } } }).jpeg().toBuffer(),
      slot: { x: 200, y: 200, w: 400, h: 400 },
      aspectRatio: '4:5',
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });

  it('leaves the page unresized while a pair is still being placed', async () => {
    // Normalising between photographs would move the page under slot
    // coordinates measured against it, and the second photo would miss.
    const page = await borderedPage();
    const out = await composeWithPhoto({
      page,
      photo: await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } } }).jpeg().toBuffer(),
      slot: { x: 200, y: 200, w: 400, h: 400 },
      aspectRatio: '4:5',
      normalise: false,
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);
  });
});

describe('how big a placeholder is allowed to be', () => {
  it('accepts a hero-sized slot, which is what the prompt asks for', async () => {
    // Roughly half the canvas: the intended case.
    const out = await detectSlots(await page([{ x: 60, y: 240, w: 960, h: 700 }]));
    expect(out.slots).toHaveLength(1);
    expect(out.coverage).toBeGreaterThan(0.4);
    expect(out.coverage).toBeLessThan(0.72);
  });

  it('measures a near-full-page placeholder as such', async () => {
    // Observed on a real run: an 89% placeholder, after which the composited
    // photo covered 97.6% of the canvas and the design was buried under it.
    // renderWithAiLayout refuses this and falls back; the detector's job is
    // only to report the coverage honestly.
    const out = await detectSlots(await page([{ x: 20, y: 20, w: 1040, h: 1240 }]));
    expect(out.coverage).toBeGreaterThan(0.72);
  });
});
