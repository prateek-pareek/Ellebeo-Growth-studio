import sharp from 'sharp';
import { buildLayoutPrompt, detectSlot, composeWithPhoto, describeColour, describeTypeface, abstractReference } from './ai-layout';

const brand = {
  name: 'Kindred Studio',
  palette: {
    background: '#F3EDE3',
    depth: '#3F4A3C',
    accent: '#A3B18A',
    secondary: '#D8C3A5',
    primary: '#6B705C',
  } as any,
  typography: { heading: 'Fraunces', body: 'Source Sans 3' },
  mood: 'NATURAL_ORGANIC' as any,
  essence: ['NATURAL', 'WARM'],
};

const copy = {
  kicker: 'LOOK',
  headline: 'Lived-in blonde',
  subhead: 'Grown out, not grown tired.',
  cta: 'Book your consultation',
};

/** A page with a magenta rectangle at the given box, on a cream ground. */
async function page(
  w: number,
  h: number,
  box: { x: number; y: number; w: number; h: number } | null,
  colour = { r: 255, g: 0, b: 255 },
): Promise<Buffer> {
  const base = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 243, g: 237, b: 227 } },
  });
  if (!box) return base.png().toBuffer();
  const rect = await sharp({
    create: { width: box.w, height: box.h, channels: 3, background: colour },
  })
    .png()
    .toBuffer();
  return base.composite([{ input: rect, left: box.x, top: box.y }]).png().toBuffer();
}

describe('the brief given to the page designer', () => {
  it('puts no brand colour value in the prompt at all', () => {
    // A real run set "#A3B184C" as visible type on the post: the model reads a
    // hex string as copy to typeset, and telling it not to did not stop it.
    // The guarantee is now structural — there is no hex for it to copy.
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    for (const hex of Object.values(brand.palette as Record<string, string>)) {
      expect(prompt).not.toContain(hex);
      expect(prompt).not.toContain(hex.replace('#', ''));
    }
    expect(prompt).toMatch(/Never write a colour value/i);
  });

  it('puts no typeface NAME in the prompt either', () => {
    // Given "a Source Sans 3 feeling", the model set "Source Sans 3" as the
    // visible headline and dropped the real one. A font name is a proper noun
    // in a prompt full of copy, and it gets typeset.
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(prompt).not.toContain('Fraunces');
    expect(prompt).not.toContain('Source Sans 3');
    expect(describeTypeface('Fraunces')).toMatch(/serif/i);
    expect(describeTypeface('Source Sans 3')).toMatch(/sans/i);
    expect(describeTypeface('Cinzel')).toMatch(/capital|engraved/i);
    expect(describeTypeface('')).toMatch(/face/i);
  });

  it('describes the brand colours in words instead', () => {
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(prompt).toMatch(/Paper: a [a-z ]+/i);
    expect(describeColour('#3F4A3C')).toMatch(/deep/);
    expect(describeColour('#3F4A3C')).toMatch(/green|olive|sage/);
    expect(describeColour('not-a-colour')).toBe('a neutral tone');
  });

  it('does not call a cream paper a terracotta', () => {
    // It did, and the model produced a full terracotta page where the brand's
    // paper is cream. HSL saturation collapses near white, so a 6%-chroma
    // off-white scored 0.40 "saturated" and got named by its hue.
    const cream = describeColour('#F3EDE3');
    expect(cream).toMatch(/cream|off-white|white/i);
    expect(cream).not.toMatch(/terracotta|orange|red/i);
  });

  it('names the rest of a typical salon palette recognisably', () => {
    expect(describeColour('#D8C3A5')).toMatch(/sand|oat|beige/i);   // warm neutral
    expect(describeColour('#A3B18A')).toMatch(/sage|olive|green/i); // muted green
    expect(describeColour('#FFFFFF')).toMatch(/white/i);
    expect(describeColour('#111111')).toMatch(/near-black/i);
    expect(describeColour('#C9A227')).toMatch(/amber|gold/i);
  });

  it('asks for a slot shaped like the photograph that will fill it', () => {
    // A landscape photo dropped into a tall narrow column loses the subject.
    const wide = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5', photoAspect: 1.5 });
    expect(wide).toMatch(/LANDSCAPE/);
    expect(wide).toMatch(/Do not make it a tall narrow column/i);

    const tall = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5', photoAspect: 0.66 });
    expect(tall).toMatch(/PORTRAIT/);

    // Nothing claimed when the shape is unknown.
    expect(buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' })).not.toMatch(/SHAPE OF THE RECTANGLE/);
  });

  it('states the shape in words, not only as a ratio', () => {
    // Asked for "4:5" alone the model returned a square.
    expect(buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' })).toMatch(/taller than it is wide/i);
    expect(buildLayoutPrompt({ copy, brand, aspectRatio: '16:9' })).toMatch(/wide landscape/i);
  });

  it('asks for a photo area that is actually the hero', () => {
    // The first attempts came back with the slot at ~11% of the canvas.
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(prompt).toMatch(/HALF TO TWO-THIRDS/i);
    expect(prompt).toMatch(/A small rectangle is wrong/i);
  });

  it('forbids the model drawing a person, since the photo is composited', () => {
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(prompt).toMatch(/Do NOT draw any people, faces/i);
  });

  it('carries every word it was given and no others', () => {
    const prompt = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(prompt).toContain('Lived-in blonde');
    expect(prompt).toContain('Book your consultation');
    expect(prompt).toMatch(/set exactly these and nothing else/i);
  });
});

describe('taking the arrangement from a reference slide', () => {
  it('sends a diagram, and says it is a diagram', () => {
    // The first attempt sent the slide BLURRED. That removed the text, but a
    // blurred photograph is still a photograph: the model reproduced its
    // subject as the background of the post — a soft-focus hand holding a
    // tablet behind a hair studio's headline. A diagram has nothing to copy.
    const p = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5', hasReference: true });
    expect(p).toMatch(/DIAGRAM of a layout/i);
    expect(p).toMatch(/MAGENTA block marks where the photograph goes/i);
    expect(p).toMatch(/GREY blocks mark where type/i);
    expect(p).toMatch(/Do not reproduce the diagram itself/i);
    expect(p).not.toMatch(/blurred/i);
  });

  it("stops the reference's own copy being repeated back", () => {
    // A real run against a studio deck set "READ FOR OUR EXACT FORMULA" — the
    // reference's banner text — across both bars of the finished post.
    const p = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5', hasReference: true });
    expect(p).toMatch(/reproduce the BAND but leave it empty/i);
    expect(p).toMatch(/Use each of these ONCE/i);
  });

  it('says none of that when there is no reference', () => {
    const p = buildLayoutPrompt({ copy, brand, aspectRatio: '4:5' });
    expect(p).not.toMatch(/REFERENCE LAYOUT/);
    expect(p).not.toMatch(/leave it empty/i);
  });

  it('renders a diagram carrying no photographic content', async () => {
    // Structure has to survive: a blur that destroys the arrangement is no
    // use as a reference at all.
    const slide = await page(600, 750, { x: 300, y: 100, w: 260, h: 500 });
    const out = await abstractReference(slide);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeGreaterThan(400);

    // The photo block is still findable as a region of its own after blurring.
    const stats = await sharp(out).stats();
    // Structure survives: a uniformly flat result would mean the blur ate
    // the arrangement along with the words.
    expect(stats.channels[0].stdev).toBeGreaterThan(2);
  });
});

describe('finding the photo slot', () => {
  it('finds a clean rectangle and reports where it is', async () => {
    const png = await page(400, 500, { x: 40, y: 60, w: 200, h: 300 });
    const found = await detectSlot(png);
    expect(found.slot).toEqual({ x: 40, y: 60, w: 200, h: 300 });
    expect(found.rectangularity).toBeCloseTo(1, 1);
  });

  it('still finds it when the model shifts the placeholder toward its palette', async () => {
    // Asked for #FF00FF, a real run returned a deep pink instead.
    const png = await page(400, 500, { x: 30, y: 30, w: 220, h: 320 }, { r: 214, g: 35, b: 122 });
    const found = await detectSlot(png);
    expect(found.slot).not.toBeNull();
  });

  it('refuses when the model left no placeholder at all', async () => {
    const found = await detectSlot(await page(400, 500, null));
    expect(found.slot).toBeNull();
    expect(found.reason).toMatch(/no placeholder/i);
  });

  it('refuses a sliver — that is not a hero photograph', async () => {
    const png = await page(400, 500, { x: 10, y: 10, w: 40, h: 40 });
    const found = await detectSlot(png);
    expect(found.slot).toBeNull();
    expect(found.reason).toMatch(/too small/i);
  });

  it('refuses a scatter rather than pasting the photo over the design', async () => {
    // Two distant blocks: the bounding box is huge but mostly empty, so the
    // photo would land on top of type if we trusted it.
    const base = sharp({
      create: { width: 400, height: 500, channels: 3, background: { r: 243, g: 237, b: 227 } },
    });
    const blob = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const png = await base
      .composite([
        { input: blob, left: 10, top: 10 },
        { input: blob, left: 320, top: 420 },
      ])
      .png()
      .toBuffer();
    const found = await detectSlot(png);
    expect(found.slot).toBeNull();
    expect(found.reason).toMatch(/not a clean rectangle/i);
  });

  it('does not mistake a warm brand colour for the placeholder', async () => {
    // Nudes and terracottas keep green near red; the placeholder does not.
    const png = await page(400, 500, { x: 40, y: 60, w: 200, h: 300 }, { r: 216, g: 195, b: 165 });
    const found = await detectSlot(png);
    expect(found.slot).toBeNull();
  });
});

describe('placing the photograph', () => {
  it('leaves no placeholder showing around the photo', async () => {
    const box = { x: 40, y: 60, w: 200, h: 300 };
    const built = await page(400, 500, box);
    const photo = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 20, g: 90, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const out = await composeWithPhoto({ page: built, photo, slot: box, aspectRatio: '4:5' });
    const found = await detectSlot(out);
    // Any magenta left would be a fringe around the pasted photo.
    expect(found.slot).toBeNull();
  });

  it('returns the canvas the rest of the pipeline expects', async () => {
    const box = { x: 40, y: 60, w: 200, h: 300 };
    const built = await page(400, 500, box);
    const photo = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const out = await composeWithPhoto({ page: built, photo, slot: box, aspectRatio: '4:5' });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });
});
