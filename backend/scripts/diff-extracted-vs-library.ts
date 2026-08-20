import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Mechanically verifies compile-extracted-to-library.ts didn't lose any data — not an eyeball
// check. For every entry in the raw extraction, confirms every field made it into the compiled
// library entry, either byte-identical (for fields that should never change) or as an equivalent
// set/multiset (for the fields the compiler is documented to dedupe/sort). Anything that doesn't
// match one of those two expectations is reported as a real discrepancy.

const EXTRACTED_FILE = path.join(__dirname, 'output', 'template-library-extracted.json');
const COMPILED_FILE = path.join(__dirname, 'output', 'template-library-compiled.json');
const REPORT_FILE = path.join(__dirname, 'output', 'diff-report.md');

const EXACT_FIELDS = [
  'sourceFile', 'canvas', 'dominantPalette', 'concept', 'visual_structure', 'image_mask',
  'typography', 'implementation_difficulty', 'why_unique', 'category',
  'macroFaceSafe', 'requiresText', 'supportsNoText', 'textDensity', 'isCarouselOnly',
];

const DEDUPED_SET_FIELDS = ['decorative_elements', 'suitable_posts', 'best_use_cases'];
const REORDERED_MULTISET_FIELDS = ['elements', 'occupiedTextZones'];

function normalizeSet(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr || []) {
    const v = (raw || '').trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort();
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function multisetEqual(a: any[], b: any[]): boolean {
  if ((a || []).length !== (b || []).length) return false;
  const as = (a || []).map(stableStringify).sort();
  const bs = (b || []).map(stableStringify).sort();
  return as.every((v, i) => v === bs[i]);
}

type Discrepancy = { id: string; field: string; detail: string };

function main() {
  const extractedRaw = JSON.parse(fs.readFileSync(EXTRACTED_FILE, 'utf-8'));
  const compiledRaw = JSON.parse(fs.readFileSync(COMPILED_FILE, 'utf-8'));

  const extractedIds = Object.keys(extractedRaw).filter((k) => k !== '_meta' && k !== '_failed');
  const idPrefix = compiledRaw._meta?.idPrefix || 'auto_';

  const discrepancies: Discrepancy[] = [];
  let matchedCount = 0;
  let missingEntryCount = 0;
  let cleanCount = 0;

  for (const id of extractedIds) {
    const source = extractedRaw[id];
    const compiledKey = `${idPrefix}${id}`;
    const target = compiledRaw[compiledKey];

    if (!target) {
      missingEntryCount++;
      discrepancies.push({ id, field: '(entire entry)', detail: `No compiled entry found at key "${compiledKey}"` });
      continue;
    }
    matchedCount++;

    if (target.sourceId !== id) {
      discrepancies.push({ id, field: 'sourceId', detail: `Expected sourceId "${id}", got "${target.sourceId}"` });
    }

    let entryClean = true;

    for (const field of EXACT_FIELDS) {
      if (!util.isDeepStrictEqual(source[field], target[field])) {
        entryClean = false;
        discrepancies.push({ id, field, detail: `Value changed — expected exact match but differs` });
      }
    }

    for (const field of DEDUPED_SET_FIELDS) {
      const sourceSet = normalizeSet(source[field] || []);
      const targetSet = normalizeSet(target[field] || []);
      if (!util.isDeepStrictEqual(sourceSet, targetSet)) {
        entryClean = false;
        const lost = sourceSet.filter((v) => !targetSet.includes(v));
        const added = targetSet.filter((v) => !sourceSet.includes(v));
        discrepancies.push({
          id, field,
          detail: `Content mismatch (beyond simple dedup) — lost: [${lost.join('; ')}], unexpectedly added: [${added.join('; ')}]`,
        });
      }
    }

    for (const field of REORDERED_MULTISET_FIELDS) {
      if (!multisetEqual(source[field] || [], target[field] || [])) {
        entryClean = false;
        discrepancies.push({
          id, field,
          detail: `Element set differs — expected ${(source[field] || []).length} items (any order), found ${(target[field] || []).length}`,
        });
      }
    }

    const expectedScore = typeof source.premiumStyleScore === 'number'
      ? Math.min(10, Math.max(1, Math.round(source.premiumStyleScore)))
      : source.premiumStyleScore;
    if (target.premiumStyleScore !== expectedScore) {
      entryClean = false;
      discrepancies.push({ id, field: 'premiumStyleScore', detail: `Expected ${expectedScore} (clamped), got ${target.premiumStyleScore}` });
    }

    if (entryClean) cleanCount++;
  }

  const summary = `# Extracted vs. Compiled Library — Diff Report

- Source entries (extracted): ${extractedIds.length}
- Matched in compiled library: ${matchedCount}
- Missing from compiled library entirely: ${missingEntryCount}
- Fully clean (all fields verified, no unexpected discrepancy): ${cleanCount}
- Entries with at least one discrepancy: ${matchedCount - cleanCount}
- Total discrepancy records: ${discrepancies.length}

${discrepancies.length === 0
    ? '**Result: PASS — every field of every entry was verified present in the compiled library, either byte-identical or as an equivalent (deduped/sorted) set. Nothing was lost.**'
    : '**Result: FAIL — see discrepancies below.**\n\n' + discrepancies.map((d) => `- \`${d.id}\` → \`${d.field}\`: ${d.detail}`).join('\n')}
`;

  fs.writeFileSync(REPORT_FILE, summary);
  console.log(summary);
  console.log(`\nFull report written to: ${REPORT_FILE}`);

  if (discrepancies.length > 0) process.exit(1);
}

main();
