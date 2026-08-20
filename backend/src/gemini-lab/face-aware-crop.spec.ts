import sharp from 'sharp';
import { faceTargetAwayFromType, renderLabSlide } from './gemini-lab-compositor';

/**
 * "Type crowds the photo subject's face" was six of ten distinct design-critic
 * complaints, in both framed and full-bleed layouts, with scores flat at 51-56
 * across every version of the pipeline. These cover the geometry that decides
 * whether it can still happen.
 */

describe('aiming the face away from the type on a full-bleed post', () => {
  it('sends the face low when the type sits high', () => {
    // Headline across the top third → the face belongs in the free band below.
    const ty = faceTargetAwayFromType({ y: 0.06, h: 0.24 });
    expect(ty).toBeGreaterThan(0.5);
  });

  it('sends the face high when the type sits low', () => {
    const ty = faceTargetAwayFromType({ y: 0.66, h: 0.26 });
    expect(ty).toBeLessThan(0.5);
  });

  it('never pins the face against an edge, however greedy the type box', () => {
    // A type box covering nearly the whole canvas would otherwise push the
    // face out of frame entirely.
    expect(faceTargetAwayFromType({ y: 0, h: 0.98 })).toBeLessThanOrEqual(0.8);
    expect(faceTargetAwayFromType({ y: 0, h: 0.98 })).toBeGreaterThanOrEqual(0.2);
    expect(faceTargetAwayFromType({ y: 0.02, h: 0.96 })).toBeGreaterThanOrEqual(0.2);
  });

  it('survives a type box that runs past the canvas', () => {
    const ty = faceTargetAwayFromType({ y: 0.8, h: 0.9 });
    expect(Number.isFinite(ty)).toBe(true);
    expect(ty).toBeGreaterThanOrEqual(0.2);
    expect(ty).toBeLessThanOrEqual(0.8);
  });
});

/**
 * A photograph with the "face" as a single saturated block, so its position in
 * the rendered post can be measured rather than eyeballed.
 */
async function photoWithFaceAt(faceX: number, faceY: number): Promise<Buffer> {
  const W = 900;
  const H = 1200;
  const face = await sharp({
    create: { width: 160, height: 160, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: W, height: H, channels: 3, background: { r: 40, g: 90, b: 140 } },
  })
    .composite([{ input: face, left: Math.round(faceX * W) - 80, top: Math.round(faceY * H) - 80 }])
    .jpeg()
    .toBuffer();
}

/** The vertical centre of the red block in the rendered post, 0-1, or null. */
async function redCentreY(png: Buffer): Promise<number | null> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90) {
        sum += y;
        n += 1;
      }
    }
  }
  return n > 40 ? sum / n / info.height : null;
}

const palette = {
  background: '#F3EDE3',
  depth: '#3F4A3C',
  accent: '#A3B18A',
  secondary: '#D8C3A5',
  primary: '#6B705C',
} as any;

const spec = {
  index: 0,
  label: 'Post',
  layout: 'cover',
  photo: 'after',
  headline: 'Lived-in blonde',
  subhead: 'Grown out, not grown tired.',
  pill: 'LOOK',
  cta: '',
} as any;

describe('the face actually survives the crop', () => {
  // These render a real post, so they are slower than the pure geometry above.
  jest.setTimeout(30_000);

  it('keeps a high face in frame instead of cropping past it', async () => {
    const photo = await photoWithFaceAt(0.5, 0.18);
    const out = await renderLabSlide({
      spec,
      aspectRatio: '4:5',
      palette,
      after: photo,
      subject: { x: 0.41, y: 0.09, w: 0.18, h: 0.18, kind: 'face' },
      composition: {
        photoMode: 'full_bleed',
        photoBox: { x: 0, y: 0, w: 1, h: 1 },
        typeBox: { x: 0.08, y: 0.06, w: 0.84, h: 0.24 },
        photoShape: 'rect',
        decoration: 'none',
      } as any,
    });

    const y = await redCentreY(out);
    expect(y).not.toBeNull();
    // The contract is not "the face moves a long way" — it is "the face is not
    // under the words". Type occupies 0.06-0.30, so the face must clear 0.30.
    expect(y!).toBeGreaterThan(0.3);
  });

  it('keeps a low face in frame when the type is at the bottom', async () => {
    const photo = await photoWithFaceAt(0.5, 0.8);
    const out = await renderLabSlide({
      spec,
      aspectRatio: '4:5',
      palette,
      after: photo,
      subject: { x: 0.41, y: 0.71, w: 0.18, h: 0.18, kind: 'face' },
      composition: {
        photoMode: 'full_bleed',
        photoBox: { x: 0, y: 0, w: 1, h: 1 },
        typeBox: { x: 0.08, y: 0.68, w: 0.84, h: 0.26 },
        photoShape: 'rect',
        decoration: 'none',
      } as any,
    });

    const y = await redCentreY(out);
    expect(y).not.toBeNull();
    // Type occupies 0.68-0.94, so the face must sit above 0.68.
    expect(y!).toBeLessThan(0.68);
  });

  it('still renders when no subject was found', async () => {
    // The whole point of the fallback: a failed vision call must cost the
    // studio nothing but the improvement.
    const photo = await photoWithFaceAt(0.5, 0.3);
    const out = await renderLabSlide({
      spec,
      aspectRatio: '4:5',
      palette,
      after: photo,
      subject: null,
      composition: {
        photoMode: 'full_bleed',
        photoBox: { x: 0, y: 0, w: 1, h: 1 },
        typeBox: { x: 0.08, y: 0.06, w: 0.84, h: 0.24 },
        photoShape: 'rect',
        decoration: 'none',
      } as any,
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });

  it('keeps the face inside a framed photo box', async () => {
    const photo = await photoWithFaceAt(0.5, 0.16);
    const out = await renderLabSlide({
      spec,
      aspectRatio: '4:5',
      palette,
      after: photo,
      subject: { x: 0.41, y: 0.07, w: 0.18, h: 0.18, kind: 'face' },
      composition: {
        photoMode: 'framed',
        photoBox: { x: 0.08, y: 0.08, w: 0.84, h: 0.5 },
        typeBox: { x: 0.08, y: 0.64, w: 0.84, h: 0.28 },
        photoShape: 'rect',
        decoration: 'none',
      } as any,
    });

    // The face must appear at all: cropping it out of a framed photo is the
    // failure this change exists to prevent.
    expect(await redCentreY(out)).not.toBeNull();
  });
});
