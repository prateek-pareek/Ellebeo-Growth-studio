import * as fs from 'fs';
import * as path from 'path';

// Pure local aggregation over the already-extracted JSON — no AI calls, no cost.
const INPUT_FILE = path.join(__dirname, 'output', 'template-library-extracted.json');
const OUTPUT_MD = path.join(__dirname, 'output', 'design-knowledge-graph-report.md');
const OUTPUT_JSON = path.join(__dirname, 'output', 'design-knowledge-graph.json');
const OUTPUT_PER_TEMPLATE = path.join(__dirname, 'output', 'design-knowledge-graph-per-template.json');

type Elem = {
  role: string;
  type: string;
  bbox: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
};

type Template = {
  sourceFile: string;
  concept: string;
  visual_structure: string;
  image_mask: string;
  typography: string;
  decorative_elements: string[];
  suitable_posts: string[];
  why_unique: string;
  category: string;
  textDensity: string;
  requiresText: boolean;
  supportsNoText: boolean;
  elements: Elem[];
};

function loadTemplates(): Record<string, Template> {
  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const out: Record<string, Template> = {};
  for (const k of Object.keys(raw)) {
    if (k === '_meta' || k === '_failed') continue;
    out[k] = raw[k];
  }
  return out;
}

function has(text: string, ...kws: string[]): boolean {
  return kws.some((k) => text.includes(k));
}

// ---------- Single-label classifiers ----------

function classifyLayoutFamily(t: Template): string {
  const text = [t.concept, t.visual_structure, t.image_mask, t.category, ...(t.suitable_posts || [])]
    .join(' ')
    .toLowerCase();
  const photoElems = (t.elements || []).filter((e) => e.type === 'image').length;
  const textElems = (t.elements || []).filter((e) => e.type === 'text').length;

  if (has(text, 'before', 'after') && has(text, 'vs', 'comparison', 'before/after', 'before and after')) return 'before_after';
  if (has(text, 'transformation', 'result reveal', 'reveal')) return 'transformation';
  if (has(text, 'testimonial', 'review') && has(text, 'client', 'customer', 'star')) return 'testimonial';
  if (has(text, 'quote') && !has(text, 'testimonial')) return 'minimalist_quote';
  if (has(text, 'clinical', 'medical', 'dermatolog', 'skincare routine', 'treatment')) return 'clinical_hero';
  if (photoElems === 0 && textElems > 0) return 'text_only';
  if (has(text, 'product launch', 'product showcase', 'product display', 'product photo')) return 'product_showcase';
  if (has(text, 'divided into two', 'split into two', 'side-by-side', 'side by side', 'two halves')) return 'split';
  if (has(text, 'editorial', 'magazine', 'swiss', 'typographic module')) return 'magazine';
  if (has(text, 'polaroid')) return 'polaroid';
  if (has(text, 'quadrant', '2x2', 'four-way grid', 'four quadrant')) return 'quadrant';
  if (has(text, 'scrapbook', 'torn paper', 'washi tape', 'collage')) return 'scrapbook';
  if (has(text, 'countdown', 'sale', 'offer', 'promo', 'discount')) return 'countdown_promo';
  if (has(text, 'notification', 'chat bubble', 'alert card')) return 'notification_card';
  if (has(text, 'announcement', 'announce')) return 'announcement';
  if (has(text, 'editorial')) return 'editorial';
  return 'editorial'; // dominant catch-all, matching the largest observed family shape (headline + supporting photo/text block)
}

function classifyVisualStyle(t: Template): string {
  const text = [t.concept, t.visual_structure, t.why_unique, t.typography].filter(Boolean).join(' ').toLowerCase();
  if (has(text, 'clinical', 'medical', 'sterile')) return 'clinical';
  if (has(text, 'organic', 'natural', 'earthy', 'botanical', 'warm')) return 'organic';
  if (has(text, 'editorial', 'magazine', 'swiss')) return 'editorial';
  if (has(text, 'modern') && !has(text, 'minimal')) return 'modern';
  if (has(text, 'minimalist')) return 'minimalist';
  return 'minimal';
}

function classifyTypography(t: Template): string {
  const text = (t.typography || '').toLowerCase();
  // "sans-serif" contains the substring "serif" — strip it first so a real (non-sans) serif
  // mention isn't falsely detected just because "sans-serif" was mentioned.
  const textWithoutSansSerif = text.replace(/sans[\s-]?serif/g, '');
  const hasSans = has(text, 'sans');
  const hasPureSerif = has(textWithoutSansSerif, 'serif');
  const hasScript = has(text, 'script', 'handwritten', 'cursive');
  const hasItalic = has(text, 'italic');

  if (hasScript) return 'script';
  if (hasPureSerif && has(text, 'fashion', 'display', 'elegant', 'editorial')) return 'fashion_serif';
  if (hasPureSerif && hasSans) return 'mixed';
  if (hasPureSerif) return 'serif';
  if (hasItalic && hasSans) return 'italic_sans';
  if (has(text, 'bold') && hasSans) return 'bold_sans';
  if (has(text, 'modern') && hasSans) return 'modern_sans';
  if (hasSans) return 'bold_sans';
  return 'mixed';
}

// ---------- Geometry-based classifiers (computed from real extracted bbox data) ----------

function textLikeElements(t: Template): Elem[] {
  return (t.elements || []).filter((e) => e.type === 'text');
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

// Five real outcomes (matching the reference taxonomy), each backed by its own geometric
// condition on actual extracted bbox centers — no default-to-"center-down" catch-all for
// whatever doesn't match; ambiguous layouts land in an honest "asymmetric" bucket instead.
function classifyReadingFlow(t: Template): string {
  const els = textLikeElements(t).sort((a, b) => a.bbox.yPercent - b.bbox.yPercent);
  if (els.length === 0) return 'undetermined';
  if (els.length === 1) return 'center-down'; // a single focal element is trivially top-to-bottom/centered

  const centers = els.map((e) => ({
    x: e.bbox.xPercent + e.bbox.widthPercent / 2,
    y: e.bbox.yPercent + e.bbox.heightPercent / 2,
  }));
  const avgX = mean(centers.map((c) => c.x));
  const avgY = mean(centers.map((c) => c.y));
  const xStd = stddev(centers.map((c) => c.x));
  const yStd = stddev(centers.map((c) => c.y));

  // Angular-sector spread around the centroid. NOTE: a plain resultant-vector-length test is
  // degenerate here — any collinear arrangement (e.g. a simple vertical heading/body/footer
  // stack) is bimodal (angles point only "up" and "down"), which trivially cancels to a near-zero
  // resultant length and would be misread as circular. Counting *distinct occupied sectors*
  // instead correctly treats a straight line as low-spread (2 sectors) regardless of point count.
  const SECTORS = 8;
  const occupiedSectors = new Set(
    centers.map((c) => {
      const angle = Math.atan2(c.y - avgY, c.x - avgX);
      const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
      return Math.floor((normalized / (Math.PI * 2)) * SECTORS);
    }),
  );

  const xs = centers.map((c) => c.x);
  const first = xs[0];
  const last = xs[xs.length - 1];
  const monotonicIncreasing = xs.every((x, i) => i === 0 || x >= xs[i - 1] - 3);
  const monotonicDecreasing = xs.every((x, i) => i === 0 || x <= xs[i - 1] + 3);

  // Check the well-defined, common patterns first (tight column, one-directional sweep, classic
  // Z) — these are reliable off just the first/last/spread of a couple of points. Only fall
  // through to the rarer, sector-spread-based circular/center-outward checks once none of those
  // simpler, more common patterns match.

  // Tightly clustered near horizontal center.
  if (xStd < 12) return 'center-down';

  // Consistent one-directional horizontal drift across several steps as the eye moves down the
  // canvas. Requires >=3 points: with exactly 2 points, "monotonic" is trivially always true
  // (a straight line only has one segment), which would make every simple two-element opposite-
  // corner layout register as "diagonal" instead of the (more likely intended) "z-pattern" below.
  if (els.length >= 3 && (monotonicIncreasing || monotonicDecreasing) && Math.abs(last - first) > 20) return 'diagonal';

  // Starts on one side, ends on the opposite side, away from center — classic Z sweep.
  if (Math.abs(first - 50) > 20 && Math.abs(last - 50) > 20 && Math.sign(first - 50) !== Math.sign(last - 50)) return 'z-pattern';

  // Elements occupy most of the ring around a shared center — a genuine radial/circular layout,
  // not just a line (a line can never occupy more than 2 opposite sectors).
  if (els.length >= 4 && occupiedSectors.size >= 5) return 'circular';

  // Elements spread across several directions (not a single line) in both axes at once.
  if (els.length >= 3 && occupiedSectors.size >= 3 && xStd > 12 && yStd > 12) return 'center-outward';

  return 'asymmetric';
}

// Grid-occupancy coverage (not naive summed area) so overlapping elements aren't double-counted.
function classifyNegativeSpace(t: Template): string {
  const GRID = 20; // 20x20 cells
  const occupied = new Set<number>();
  for (const e of t.elements || []) {
    if (e.role === 'background') continue;
    const x0 = Math.max(0, Math.floor((e.bbox.xPercent / 100) * GRID));
    const x1 = Math.min(GRID, Math.ceil(((e.bbox.xPercent + e.bbox.widthPercent) / 100) * GRID));
    const y0 = Math.max(0, Math.floor((e.bbox.yPercent / 100) * GRID));
    const y1 = Math.min(GRID, Math.ceil(((e.bbox.yPercent + e.bbox.heightPercent) / 100) * GRID));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) occupied.add(y * GRID + x);
    }
  }
  const coverage = (occupied.size / (GRID * GRID)) * 100;
  if (coverage < 25) return 'large';
  if (coverage < 50) return 'moderate';
  return 'tight';
}

// ---------- Multi-label decoration tag extraction ----------

const DECORATION_VOCAB: [string, string[]][] = [
  ['geometric_badge', ['badge']],
  ['paper_tape', ['washi tape', 'masking tape', 'paper tape']],
  ['divider', ['divider', 'rule line', 'dividing line']],
  ['arrow', ['arrow']],
  ['butterfly', ['butterfly']],
  ['polaroid', ['polaroid']],
  ['shadow', ['shadow']],
  ['star_rating', ['star rating', 'star icon', 'stars']],
  ['floral', ['floral', 'flower']],
  ['rounded_corners', ['rounded corner']],
  ['quotation_marks', ['quotation mark', 'quote mark']],
  ['heart', ['heart']],
  ['circle', ['circle', 'circular shape']],
  ['paper_clip', ['paper clip', 'paperclip']],
  ['collage', ['collage']],
  ['speech_bubble', ['speech bubble', 'chat bubble']],
  ['doodle', ['doodle']],
  ['disco_ball', ['disco ball']],
  ['film_strip', ['film strip', 'sprocket']],
  ['dotted_border', ['dotted border', 'dotted line']],
  ['striped_background', ['striped background', 'stripe']],
  ['color_block', ['color block', 'colour block']],
  ['numbered_list', ['numbered list', 'number label']],
  ['textured_background', ['texture', 'textured']],
  ['underline', ['underline']],
  ['pushpin', ['pushpin', 'push pin']],
  ['clipboard', ['clipboard']],
  ['camera', ['camera icon', 'camera graphic']],
  ['outline', ['outline']],
  ['illustration', ['illustration']],
  ['arch_frame', ['arch-shaped', 'arch frame', 'arch mask']],
  ['icon_badge', ['icon badge']],
  ['megaphone', ['megaphone']],
  ['polka_dot', ['polka dot']],
  ['registration_marks', ['registration mark']],
  ['barcode', ['barcode']],
  ['perforation', ['perforation', 'perforated', 'tear line']],
  ['ribbon', ['ribbon']],
  ['seal', ['wax seal', 'seal']],
  ['grid_lines', ['grid line', 'module system', 'coordinate label']],
  ['gradient', ['gradient']],
  ['frame_border', ['frame', 'border']],
  ['gold_accents', ['gold accent', 'gold foil']],
];

function extractDecorationTags(t: Template): string[] {
  const text = (t.decorative_elements || []).join(' | ').toLowerCase();
  const tags: string[] = [];
  for (const [tag, kws] of DECORATION_VOCAB) {
    if (kws.some((kw) => text.includes(kw))) tags.push(tag);
  }
  return tags;
}

// ---------- Aggregation ----------

function tally(values: string[]): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const total = values.length;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

function fmtSection(title: string, rows: { label: string; count: number; pct: number }[]): string {
  const lines = rows.map((r) => `${r.label}: ${r.pct.toFixed(1)}% (${r.count})`);
  return `### ${title}\n${lines.join('\n')}\n`;
}

async function main() {
  const templates = loadTemplates();
  const ids = Object.keys(templates);
  const n = ids.length;
  console.log(`Analyzing ${n} extracted templates (local, no AI calls)...`);

  const layoutFamilies: string[] = [];
  const visualStyles: string[] = [];
  const readingFlows: string[] = [];
  const negativeSpaces: string[] = [];
  const typographySystems: string[] = [];
  const decorationTagsAll: string[] = [];
  const perTemplate: Record<string, any> = {};

  for (const id of ids) {
    const t = templates[id];
    const layoutFamily = classifyLayoutFamily(t);
    const visualStyle = classifyVisualStyle(t);
    const readingFlow = classifyReadingFlow(t);
    const negativeSpace = classifyNegativeSpace(t);
    const typographySystem = classifyTypography(t);
    const decorationTags = extractDecorationTags(t);

    layoutFamilies.push(layoutFamily);
    visualStyles.push(visualStyle);
    readingFlows.push(readingFlow);
    negativeSpaces.push(negativeSpace);
    typographySystems.push(typographySystem);
    decorationTagsAll.push(...decorationTags);

    perTemplate[id] = {
      sourceFile: t.sourceFile,
      layoutFamily,
      visualStyle,
      readingFlow,
      negativeSpace,
      typographySystem,
      decorationTags,
    };
  }

  const layoutFamilyTally = tally(layoutFamilies);
  const visualStyleTally = tally(visualStyles);
  const readingFlowTally = tally(readingFlows);
  const negativeSpaceTally = tally(negativeSpaces);
  const typographyTally = tally(typographySystems);
  const decorationTally = tally(decorationTagsAll);

  const top5Families = layoutFamilyTally.slice(0, 5).map((r) => r.label).join(', ');

  const md = `# Design Knowledge Graph Report

This report was procedurally generated locally (no AI calls) by aggregating the GPT-4o-mini vision extraction already run on ${n} unique purchased Instagram/PPT template designs.

Layout family, visual style, typography-system, reading-flow and negative-space labels are derived by rule-based classification over the extracted \`concept\` / \`visual_structure\` / \`typography\` / \`elements[].bbox\` fields — reading-flow and negative-space are computed directly from real extracted bounding-box geometry, not re-guessed.

## 1. Procedural Layout Families
These are the dominant layout architectures discovered across the dataset. The future compiler will only need to know how to build these specific families.

${fmtSection('', layoutFamilyTally)}
## 2. Visual Style Systems
The overarching stylistic themes that dictate the mood of the templates.

${fmtSection('', visualStyleTally)}
## 3. Composition & Psychology

### Reading Flow Strategies
How the layout's text elements are arranged for the eye to move across the canvas (computed from actual element x/y positions).

${fmtSection('', readingFlowTally)}
### Negative Space Allocation
How much of the canvas is covered by elements vs. left open (computed from actual bounding-box area coverage).

${fmtSection('', negativeSpaceTally)}
## 4. Typography Systems
The dominant font pairing choices for headlines, parsed from the extracted \`typography\` description.

${fmtSection('', typographyTally)}
## 5. Decoration Components
The most common geometric/decorative primitives mentioned in the extracted \`decorative_elements\` field (multi-label — a template can contribute more than one tag; percentages are of total tag occurrences, not template count).

${fmtSection('', decorationTally)}
---
**TIP — What this means for development:** We do not need to build a rigid compiler that tries to handle infinite edge cases. Based on this dataset, the top layout families are: **${top5Families}**. A deterministic compiler targeting just these, applying the dominant reading-flow (${readingFlowTally[0]?.label}) and negative-space (${negativeSpaceTally[0]?.label}) rules, would cover the large majority of this template library.

*Caveats:*
*- These labels come from a local rule-based classifier over AI-extracted text/geometry, not a second AI pass — treat family boundaries as approximate, not ground truth.*
*- Negative-space skews toward "tight" here (vs. typically-spacious professional templates) likely because the vision model's bounding boxes tend to run larger than the element's actual visible extent — treat the tight/moderate/large split as directionally useful, not a precise area measurement.*
`;

  fs.writeFileSync(OUTPUT_MD, md);
  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(
      {
        templateCount: n,
        layoutFamilies: layoutFamilyTally,
        visualStyles: visualStyleTally,
        readingFlows: readingFlowTally,
        negativeSpace: negativeSpaceTally,
        typography: typographyTally,
        decorationComponents: decorationTally,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(OUTPUT_PER_TEMPLATE, JSON.stringify(perTemplate, null, 2));

  console.log(`\nDone. Wrote:\n- ${OUTPUT_MD}\n- ${OUTPUT_JSON}\n- ${OUTPUT_PER_TEMPLATE} (per-template breakdown, for spot-checking any single template's classification)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
