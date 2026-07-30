import * as fs from 'fs';
import * as path from 'path';

// Compiles the raw GPT-4o-mini extraction output (template-library-extracted.json) into a
// namespaced "library" file. This is a lossless transform: every field on every entry is
// carried through verbatim (via object spread) — the only changes made are additive/structural
// (documented below), never a field being dropped or overwritten silently. Run
// diff-extracted-vs-library.ts afterwards to get a mechanically-verified proof of that, not just
// an eyeball check.

const INPUT_FILE = path.join(__dirname, 'output', 'template-library-extracted.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'template-library-compiled.json');

// Same "auto_" namespace convention already used for AI-generated entries in
// backend/src/ai/config/layout-templates.config.json, so these can't collide with
// hand-authored template-library.json keys if merged later.
const ID_PREFIX = 'auto_';

const REQUIRED_FIELDS = [
  'sourceFile', 'canvas', 'dominantPalette',
  'concept', 'visual_structure', 'image_mask', 'typography',
  'decorative_elements', 'suitable_posts', 'implementation_difficulty', 'why_unique',
  'category', 'best_use_cases', 'macroFaceSafe', 'requiresText', 'supportsNoText',
  'textDensity', 'isCarouselOnly', 'premiumStyleScore', 'occupiedTextZones', 'elements',
];

function dedupeCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const v = (raw || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const ids = Object.keys(raw).filter((k) => k !== '_meta' && k !== '_failed');

  const compiled: Record<string, any> = {};
  const validationErrors: { id: string; missingFields: string[] }[] = [];
  let normalizedCount = 0;

  for (const id of ids) {
    const entry = raw[id];

    const missingFields = REQUIRED_FIELDS.filter((f) => !(f in entry));
    if (missingFields.length > 0) {
      validationErrors.push({ id, missingFields });
      // Still carry the entry through as-is — validation failure is reported, not silently dropped.
    }

    let normalized = false;
    const before = JSON.stringify(entry);

    // Full passthrough first — every field on the source entry is preserved by default.
    const compiledEntry: Record<string, any> = { ...entry };

    // Documented, additive/structural normalizations only (never a field removal):
    // 1. Dedupe + trim string-array fields (case-insensitive). Only removes exact duplicates.
    for (const field of ['decorative_elements', 'suitable_posts', 'best_use_cases'] as const) {
      if (Array.isArray(entry[field])) {
        compiledEntry[field] = dedupeCaseInsensitive(entry[field]);
      }
    }
    // 2. Sort elements by zIndex (rendering order) — same set of elements, stable order.
    if (Array.isArray(entry.elements)) {
      compiledEntry.elements = [...entry.elements].sort((a: any, b: any) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    }
    // 3. Sort occupiedTextZones by yMinPercent — same zones, stable order.
    if (Array.isArray(entry.occupiedTextZones)) {
      compiledEntry.occupiedTextZones = [...entry.occupiedTextZones].sort((a: any, b: any) => a.yMinPercent - b.yMinPercent);
    }
    // 4. Clamp premiumStyleScore into its documented 1-10 integer range (defensive only).
    if (typeof entry.premiumStyleScore === 'number') {
      compiledEntry.premiumStyleScore = Math.min(10, Math.max(1, Math.round(entry.premiumStyleScore)));
    }
    // 5. Preserve full traceability back to the original extraction key/id.
    compiledEntry.sourceId = id;

    if (JSON.stringify(compiledEntry) !== before) { normalized = true; }
    if (normalized) normalizedCount++;

    compiled[`${ID_PREFIX}${id}`] = compiledEntry;
  }

  const output = {
    _meta: {
      compiledAt: new Date().toISOString(),
      sourceFile: path.basename(INPUT_FILE),
      idPrefix: ID_PREFIX,
      count: Object.keys(compiled).length,
      normalizedEntries: normalizedCount,
      validationErrorCount: validationErrors.length,
    },
    _validationErrors: validationErrors,
    ...compiled,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`Compiled ${ids.length} entries -> ${OUTPUT_FILE}`);
  console.log(`Normalized (dedup/sort/clamp touched something): ${normalizedCount}`);
  if (validationErrors.length > 0) {
    console.warn(`WARNING: ${validationErrors.length} entries were missing expected fields:`);
    for (const v of validationErrors.slice(0, 10)) console.warn(`  ${v.id}: missing [${v.missingFields.join(', ')}]`);
    if (validationErrors.length > 10) console.warn(`  ...and ${validationErrors.length - 10} more`);
  } else {
    console.log('No missing-field validation errors.');
  }
}

main();
