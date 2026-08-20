import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI();

// ---- Config ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const SOURCE_DIR = args.dir || 'C:\\Users\\kriti\\Downloads\\PNG_Output';
const LIMIT = parseInt(args.limit || '1000', 10);
const CONCURRENCY = parseInt(args.concurrency || '8', 10);
const MODEL = 'gpt-4o-mini';
const OUTPUT_FILE = path.join(__dirname, 'output', 'template-library-extracted.json');
const FLUSH_EVERY = 20;

// Pricing (per 1M tokens) — gpt-4o-mini
const INPUT_PRICE_PER_M = 0.15;
const OUTPUT_PRICE_PER_M = 0.6;

// ---- JSON schema (strict) — combines template-library.json shape + ITemplateMetadata shape + a superset elements[] layer ----
const EXTRACTION_SCHEMA = {
  name: 'TemplateExtraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      concept: { type: 'string' },
      visual_structure: { type: 'string' },
      image_mask: { type: 'string' },
      typography: { type: 'string' },
      decorative_elements: { type: 'array', items: { type: 'string' } },
      suitable_posts: { type: 'array', items: { type: 'string' } },
      implementation_difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
      why_unique: { type: 'string' },

      category: { type: 'string' },
      best_use_cases: { type: 'array', items: { type: 'string' } },
      macroFaceSafe: { type: 'boolean' },
      requiresText: { type: 'boolean' },
      supportsNoText: { type: 'boolean' },
      textDensity: { type: 'string', enum: ['low', 'medium', 'high'] },
      isCarouselOnly: { type: 'boolean' },
      premiumStyleScore: { type: 'number' },
      occupiedTextZones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            yMinPercent: { type: 'number' },
            yMaxPercent: { type: 'number' },
          },
          required: ['yMinPercent', 'yMaxPercent'],
          additionalProperties: false,
        },
      },

      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: [
                'heading', 'subheading', 'body', 'tagline', 'watermark', 'footnote',
                'quote', 'cta', 'price', 'date', 'badge', 'hashtag', 'photo', 'logo',
                'decoration', 'background',
              ],
            },
            type: { type: 'string', enum: ['text', 'image', 'decoration', 'shape'] },
            content: { type: ['string', 'null'] },
            bbox: {
              type: 'object',
              properties: {
                xPercent: { type: 'number' },
                yPercent: { type: 'number' },
                widthPercent: { type: 'number' },
                heightPercent: { type: 'number' },
              },
              required: ['xPercent', 'yPercent', 'widthPercent', 'heightPercent'],
              additionalProperties: false,
            },
            alignment: { type: ['string', 'null'], enum: ['left', 'center', 'right', null] },
            fontStyle: { type: ['string', 'null'], enum: ['serif', 'sans', 'script', 'display', null] },
            fontWeight: { type: ['string', 'null'], enum: ['light', 'regular', 'bold', null] },
            colorHex: { type: ['string', 'null'] },
            zIndex: { type: 'number' },
          },
          required: ['role', 'type', 'content', 'bbox', 'alignment', 'fontStyle', 'fontWeight', 'colorHex', 'zIndex'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'concept', 'visual_structure', 'image_mask', 'typography', 'decorative_elements',
      'suitable_posts', 'implementation_difficulty', 'why_unique',
      'category', 'best_use_cases', 'macroFaceSafe', 'requiresText', 'supportsNoText',
      'textDensity', 'isCarouselOnly', 'premiumStyleScore', 'occupiedTextZones', 'elements',
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are a senior UI/graphic-design analyst cataloging purchased social-media (Instagram post/story/carousel) design templates for a template library.

For the single image you are shown, describe its design as data. Be precise and do not miss small details (fine print, badges, small icons, subtle dividers, watermarks) — the goal is that someone could redesign this template from your description alone and have it look recognizably the same.

Field guidance:
- concept: 1-2 sentences, the core creative idea of this design.
- visual_structure: 2-4 sentences describing the actual layout (what's where, how the canvas is divided).
- image_mask: how any photo is framed (e.g. "Rectangle, full-bleed", "Circle crop, centered", "None — text-only template").
- typography: describe the font style(s) seen (e.g. "Bold serif display headline, thin sans caption").
- decorative_elements: every small decorative detail you can see (badges, dividers, textures, frames, stickers, icons) — do not skip minor ones.
- suitable_posts: what kind of social post this template suits (e.g. "Quote post", "Before/after", "Promo/sale", "Testimonial").
- implementation_difficulty: how hard this would be to rebuild as a code-driven SVG template (Easy/Medium/Hard).
- why_unique: what makes this design distinct from a generic template.
- category: the general content category (e.g. "skincare", "hair salon", "makeup artist", "quotes/motivational", "coaching", "general beauty").
- best_use_cases: 2-4 short use-case tags.
- macroFaceSafe: true if the layout has no large photo area that a face crop would conflict with (i.e. safe for a face photo without covering it).
- requiresText: true if the template looks broken/empty without text on it.
- supportsNoText: true if the template would still look good with zero text (pure visual/photo).
- textDensity: how much text is on the template (low/medium/high).
- isCarouselOnly: true only if this is clearly one numbered slide of a multi-slide carousel sequence.
- premiumStyleScore: rate 1-10 how premium/polished the design looks.
- occupiedTextZones: the vertical band(s) (as % of canvas height, 0=top, 100=bottom) where text sits, for collision-avoidance with photos.
- elements: an exhaustive inventory of every distinct element on the canvas (every text block, the photo/image area, every decoration/shape/logo/watermark) with its approximate bounding box in percent of canvas (0-100), z-order (higher = on top), and style. "content" is the actual example text seen for text elements, or null for non-text elements. Use "colorHex" for your best estimate of that element's color.

You will also be told the exact canvas pixel dimensions — use that only for context, do not restate it.`;

// ---- Utilities ----

function slugifyFolder(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildId(folder: string, filename: string): string {
  const folderSlug = slugifyFolder(folder);
  const m = filename.match(/slide\s*(\d+)/i);
  if (m) return `${folderSlug}-slide-${m[1].padStart(2, '0')}`;
  return `${folderSlug}-${slugifyFolder(path.basename(filename, path.extname(filename)))}`;
}

function labelAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  const known: [string, number][] = [
    ['1:1', 1], ['4:5', 0.8], ['5:4', 1.25], ['9:16', 0.5625],
    ['16:9', 1.7778], ['3:4', 0.75], ['4:3', 1.3333], ['2:3', 0.6667], ['3:2', 1.5],
  ];
  let best = known[0];
  let bestDiff = Infinity;
  for (const k of known) {
    const diff = Math.abs(k[1] - ratio);
    if (diff < bestDiff) { bestDiff = diff; best = k; }
  }
  return best[0];
}

async function getDominantPalette(buffer: Buffer, count = 5): Promise<string[]> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const freq = new Map<string, number>();
  const channels = info.channels;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const qr = Math.round(data[i] / 24) * 24;
    const qg = Math.round(data[i + 1] / 24) * 24;
    const qb = Math.round(data[i + 2] / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return '#' + [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('');
    });
}

function collectPngFiles(rootDir: string): { folder: string; filename: string; fullPath: string }[] {
  const folders = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const files: { folder: string; filename: string; fullPath: string }[] = [];
  for (const folder of folders) {
    const folderPath = path.join(rootDir, folder);
    const pngs = fs.readdirSync(folderPath)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.localeCompare(b));
    for (const filename of pngs) {
      files.push({ folder, filename, fullPath: path.join(folderPath, filename) });
    }
  }
  return files;
}

// Simple concurrency pool
async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) * 2));
      }
    }
  }
  throw lastErr;
}

// ---- Main ----
async function main() {
  console.log(`--- Template Metadata Extraction (${MODEL}) ---`);
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Limit: ${LIMIT}, Concurrency: ${CONCURRENCY}`);

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  const allFiles = collectPngFiles(SOURCE_DIR);
  const targetFiles = allFiles.slice(0, LIMIT);
  console.log(`Found ${allFiles.length} total PNGs, processing first ${targetFiles.length}.`);

  let output: Record<string, any> = { _meta: {}, _failed: [] as any[] };
  if (fs.existsSync(OUTPUT_FILE)) {
    output = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    if (!output._failed) output._failed = [];
  }

  const alreadyDone = new Set(Object.keys(output).filter((k) => k !== '_meta' && k !== '_failed'));
  console.log(`Resuming: ${alreadyDone.size} already extracted, will skip those.`);

  let promptTokens = 0;
  let completionTokens = 0;
  let successCount = 0;
  let failCount = 0;
  let processedSinceFlush = 0;

  function flush() {
    output._meta = {
      extractedAt: new Date().toISOString(),
      model: MODEL,
      sourceDir: SOURCE_DIR,
      count: Object.keys(output).filter((k) => k !== '_meta' && k !== '_failed').length,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  }

  const todo = targetFiles
    .map((f) => ({ ...f, id: buildId(f.folder, f.filename) }))
    .filter((f) => !alreadyDone.has(f.id));

  console.log(`${todo.length} images left to process.\n`);

  let completed = 0;
  await runPool(todo, CONCURRENCY, async (file) => {
    const idx = ++completed;
    try {
      const buffer = fs.readFileSync(file.fullPath);
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const aspectRatio = labelAspectRatio(width, height);
      const palette = await getDominantPalette(buffer);

      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      const response = await withRetry(() =>
        openai.chat.completions.create({
          model: MODEL,
          temperature: 0.1,
          response_format: { type: 'json_schema', json_schema: EXTRACTION_SCHEMA },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Canvas: ${width}x${height}px (${aspectRatio}). Analyze this template design.` },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              ] as any,
            },
          ],
        }),
      );

      const jsonStr = response.choices[0].message.content;
      if (!jsonStr) throw new Error('Empty response');
      const parsed = JSON.parse(jsonStr);

      output[file.id] = {
        sourceFile: `${file.folder}/${file.filename}`,
        canvas: { widthPx: width, heightPx: height, aspectRatio },
        dominantPalette: palette,
        ...parsed,
      };

      const usage = response.usage;
      if (usage) {
        promptTokens += usage.prompt_tokens || 0;
        completionTokens += usage.completion_tokens || 0;
      }
      successCount++;
      console.log(`[${idx}/${todo.length}] ${file.id} OK (${usage?.total_tokens ?? '?'} tokens)`);
    } catch (err: any) {
      failCount++;
      output._failed.push({ id: file.id, sourceFile: `${file.folder}/${file.filename}`, error: String(err?.message || err) });
      console.error(`[${idx}/${todo.length}] ${file.id} FAILED: ${err?.message || err}`);
    }

    processedSinceFlush++;
    if (processedSinceFlush >= FLUSH_EVERY) {
      flush();
      processedSinceFlush = 0;
    }
  });

  flush();

  const cost = (promptTokens / 1_000_000) * INPUT_PRICE_PER_M + (completionTokens / 1_000_000) * OUTPUT_PRICE_PER_M;

  console.log(`\n--- Done ---`);
  console.log(`Success: ${successCount}, Failed: ${failCount}, Already skipped (prior run): ${alreadyDone.size}`);
  console.log(`Prompt tokens: ${promptTokens}, Completion tokens: ${completionTokens}`);
  console.log(`Actual cost this run: $${cost.toFixed(4)}`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
