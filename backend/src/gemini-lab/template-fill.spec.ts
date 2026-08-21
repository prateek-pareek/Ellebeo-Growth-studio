import sharp from 'sharp';
import { TEMPLATES, compositionFromTemplate } from './templates';
import { renderLabSlide } from './gemini-lab-compositor';

/**
 * How much of the page each template actually fills.
 *
 * Across 49 design-critic evaluations of real output, the three most common
 * complaints were "unbalanced / lacks an anchor" (82%), "significant dead
 * space" (73%) and "reads as a template" (69%), with a mean score of 56.
 * They are one problem: a layout allocates regions, the content is shorter
 * than the region, and nothing fills or rebalances what is left.
 *
 * The critic reports that in prose, which ranks complaints but cannot say
 * whether a change helped. This measures it: render every template with the
 * same content and count the pixels that differ from the page's own ground.
 */

jest.setTimeout(180_000);

async function portrait(): Promise<Buffer> {
  // A plain portrait: the measurement is about layout, not photography.
  return sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 120, g: 90, b: 70 } } })
    .jpeg()
    .toBuffer();
}

/** Fraction of the canvas that carries anything at all. */
export async function inkCoverage(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const tally = new Map<string, number>();
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * C;
      const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  const [gr, gg, gb] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => Number(v) << 3);
  let on = 0;
  for (let i = 0; i < data.length; i += C) {
    if (Math.abs(data[i] - gr) + Math.abs(data[i + 1] - gg) + Math.abs(data[i + 2] - gb) > 60) on += 1;
  }
  return on / (W * H);
}

const palette = {
  background: '#F3EDE3', depth: '#3F4A3C', accent: '#A3B18A',
  secondary: '#D8C3A5', primary: '#6B705C',
} as any;

const spec = {
  index: 0, label: 'Post', layout: 'cover', photo: 'after',
  headline: 'Lived-in blonde', subhead: 'Grown out, not grown tired.',
  pill: 'LOOK', cta: 'Book now',
  // A template with a content-block region renders it EMPTY unless the block
  // is filled, and several layouts give the block a third of the page. The
  // first version of this measurement supplied none, so those templates
  // measured as barren when they were only unfurnished — it nearly had me
  // "fix" two layouts that were behaving correctly.
  content: {
    steps: [
      { label: 'Consultation', detail: 'We read the hair before we touch it.' },
      { label: 'Placement', detail: 'Foils mapped to how it falls.' },
      { label: 'Toning', detail: 'Tuned to the light you live in.' },
    ],
  },
} as any;

describe('how much of the page each template fills', () => {
  // Only the layouts that place a photograph in a box: full_bleed fills by
  // definition, and a typographic poster is measured on type alone.
  const placing = TEMPLATES.filter((t) => t.photoMode === 'framed');

  it('reports coverage per template, and none leaves the page mostly empty', async () => {
    const photo = await portrait();
    const rows: Array<{ id: string; coverage: number }> = [];

    for (const t of placing) {
      const out = await renderLabSlide({
        spec,
        aspectRatio: '4:5',
        palette,
        after: photo,
        subject: null,
        composition: compositionFromTemplate(t, {
          photoShape: t.photoShapes?.[0],
          // Furnish the block slot when the layout has one.
          blockKinds: t.block ? ['steps'] : [],
        }) as any,
      });
      rows.push({ id: t.id, coverage: await inkCoverage(out) });
    }

    rows.sort((a, b) => a.coverage - b.coverage);
    // eslint-disable-next-line no-console
    console.log('\ncoverage by template (low = lots of empty page):');
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log('  ' + r.id.padEnd(26) + (100 * r.coverage).toFixed(1).padStart(6) + '%');
    }

    // Where the bar sits, and why it is not higher.
    //
    // Measured here, the library is bimodal: four layouts fill 72-77%, and the
    // type-led ones sit near 17-25%. A deliberately sparse layout is a real
    // design — `corner-detail` exists to let large type carry the frame — so
    // the threshold separates BROKEN from SPARSE, not sparse from dense.
    //
    // Both offenders were below it before: corner-detail at 11% because it
    // defaulted to a circle, which keeps only pi/4 of its own box, and
    // centre-medallion at 14% because its circle sat in a box half the size of
    // the space actually available above the type.
    const barren = rows.filter((r) => r.coverage < 0.15);
    expect(barren.map((r) => `${r.id} ${(100 * r.coverage).toFixed(1)}%`)).toEqual([]);
  });
});
