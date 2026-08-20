import sharp from 'sharp';
import { scanReference } from './reference-scan';

/**
 * The image model cannot classify its own reference. Told "if the reference has
 * no photograph, draw no placeholder", it invented a photo slot on all four
 * type-only step cards of a real deck, and failed to make one on a full-bleed
 * photograph. These cover the cases it got wrong.
 */

/** A flat brand ground — the base every design slide sits on. */
function ground(w = 640, h = 800, colour = { r: 243, g: 237, b: 227 }) {
  return sharp({ create: { width: w, height: h, channels: 3, background: colour } });
}

/** Continuous tone: every pixel a slightly different shade, as a photo is. */
async function photograph(w: number, h: number): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      buf[i] = (x * 7 + y * 3) % 256;
      buf[i + 1] = (x * 3 + y * 11) % 256;
      buf[i + 2] = (x * 13 + y * 5) % 256;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** Hard-edged blocks of one colour — what dense type looks like to a scanner. */
async function typeBlocks(w: number, h: number): Promise<Buffer> {
  const bars: sharp.OverlayOptions[] = [];
  for (let i = 0; i < 14; i += 1) {
    bars.push({
      input: {
        create: { width: Math.floor(w * 0.8), height: 12, channels: 3, background: { r: 20, g: 24, b: 20 } },
      },
      left: Math.floor(w * 0.1),
      top: 20 + i * 26,
    });
  }
  return ground(w, h).composite(bars).png().toBuffer();
}

describe('classifying a reference slide', () => {
  it('sees a photograph and says where it sits', async () => {
    const photo = await photograph(360, 700);
    const slide = await ground().composite([{ input: photo, left: 260, top: 50 }]).png().toBuffer();

    const scan = await scanReference(slide);
    expect(scan.kind).toBe('photo');
    expect(scan.photoArea).toBeGreaterThan(0.1);
    // The photo is on the right-hand side, so the region must start past the middle.
    expect(scan.region!.x).toBeGreaterThan(0.2);
  });

  it('calls a type-only card typographic, however dense the type', async () => {
    // This is the case the model got wrong four times in a row: a step card
    // with a lot of text on it is still not a photograph.
    const scan = await scanReference(await typeBlocks(640, 800));
    expect(scan.kind).toBe('typographic');
    expect(scan.region).toBeNull();
  });

  it('calls a bare brand ground typographic', async () => {
    const scan = await scanReference(await ground().png().toBuffer());
    expect(scan.kind).toBe('typographic');
  });

  it('sees a full-bleed photograph', async () => {
    // The model reported this shape as unusable on a real slide.
    const scan = await scanReference(await photograph(640, 800));
    expect(scan.kind).toBe('photo');
    expect(scan.photoArea).toBeGreaterThan(0.8);
  });

  it('does not mistake a large flat colour block for imagery', async () => {
    // Brand designs are full of solid panels; none of them is a photograph.
    const panel = await sharp({
      create: { width: 400, height: 500, channels: 3, background: { r: 63, g: 74, b: 60 } },
    })
      .png()
      .toBuffer();
    const slide = await ground().composite([{ input: panel, left: 120, top: 150 }]).png().toBuffer();

    const scan = await scanReference(slide);
    expect(scan.kind).toBe('typographic');
  });

  it('ignores a photo too small to be the subject', async () => {
    // A logo or a tiny inset is not a slot for a client's photograph.
    const tiny = await photograph(60, 60);
    const slide = await ground().composite([{ input: tiny, left: 30, top: 30 }]).png().toBuffer();

    const scan = await scanReference(slide);
    expect(scan.kind).toBe('typographic');
  });
});
