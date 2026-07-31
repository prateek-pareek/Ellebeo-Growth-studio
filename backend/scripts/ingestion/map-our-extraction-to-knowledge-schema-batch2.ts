import * as fs from 'fs';
import * as path from 'path';

// Adapter for the SECOND batch of new families (before_after/testimonial/scrapbook/quadrant).
// Deliberately a separate script + separate output file from
// map-our-extraction-to-knowledge-schema.ts (which stays scoped to split/countdown_promo/
// product_showcase, untouched) rather than broadening that script's TARGET_FAMILIES in place —
// design-compiler.ts's addEntries() assigns each entry's id from a counter that increments over
// the whole input array in file order, so merging new families into the SAME input array would
// shift the counter (and therefore the ids) for the split/countdown_promo/product_showcase
// entries already compiled and live in compiled-layouts.v2.json. A separate file + a separate
// addEntries() call with its own counterPrefix avoids that class of bug entirely.

const EXTRACTED_FILE = path.join(__dirname, '../output/template-library-extracted.json');
const PER_TEMPLATE_FILE = path.join(__dirname, '../output/design-knowledge-graph-per-template.json');
const OUTPUT_FILE = path.join(__dirname, 'our_knowledge_normalized_batch2.json');

const TARGET_FAMILIES = new Set(['before_after', 'testimonial', 'scrapbook', 'quadrant']);

interface OurExtractedEntry {
  sourceFile: string;
  concept: string;
  visual_structure: string;
  typography: string;
  decorative_elements: string[];
  why_unique: string;
  category: string;
  premiumStyleScore: number;
}

interface OurPerTemplateEntry {
  sourceFile: string;
  layoutFamily: string;
  visualStyle: string;
  readingFlow: string;
  negativeSpace: string;
  typographySystem: string;
  decorationTags: string[];
}

function deriveHeadlineStyle(typographySystem: string): string {
  const map: Record<string, string> = {
    bold_sans: 'Bold sans-serif headline',
    mixed: 'Mixed serif/sans pairing',
    script: 'Script/handwritten headline',
    serif: 'Serif headline',
    fashion_serif: 'Fashion-editorial serif headline',
    italic_sans: 'Italic sans headline',
    modern_sans: 'Modern sans headline',
  };
  return map[typographySystem] || 'Sans-serif headline';
}

function deriveTracking(typographySystem: string): string {
  return typographySystem === 'script' || typographySystem === 'fashion_serif' ? 'wide' : 'normal';
}

function deriveEnergy(premiumStyleScore: number): string {
  if (premiumStyleScore >= 8) return 'bold';
  if (premiumStyleScore >= 5) return 'structured';
  return 'calm';
}

function main() {
  const extracted: Record<string, OurExtractedEntry> = JSON.parse(fs.readFileSync(EXTRACTED_FILE, 'utf-8'));
  const perTemplate: Record<string, OurPerTemplateEntry> = JSON.parse(fs.readFileSync(PER_TEMPLATE_FILE, 'utf-8'));

  const results: { hash: string; knowledge: any }[] = [];

  for (const id of Object.keys(perTemplate)) {
    const classification = perTemplate[id];
    if (!TARGET_FAMILIES.has(classification.layoutFamily)) continue;

    const raw = extracted[id];
    if (!raw) continue;

    const knowledge = {
      layoutFamily: { value: classification.layoutFamily, confidence: 0.9 },
      visualLanguage: {
        style: classification.visualStyle,
        energy: deriveEnergy(raw.premiumStyleScore),
        tone: raw.category || 'general',
        industry: raw.category || 'beauty',
      },
      composition: {
        primaryFocus: raw.visual_structure?.slice(0, 80) || 'balanced composition',
        secondaryFocus: raw.concept?.slice(0, 80) || '',
        readingFlow: classification.readingFlow,
        balance: classification.readingFlow === 'z-pattern' || classification.readingFlow === 'diagonal' ? 'asymmetrical' : 'symmetrical',
        negativeSpace: classification.negativeSpace,
      },
      typography: {
        headlineStyle: deriveHeadlineStyle(classification.typographySystem),
        hierarchy: classification.typographySystem,
        tracking: deriveTracking(classification.typographySystem),
        lineBreakStrategy: 'natural',
        contrast: raw.premiumStyleScore >= 7 ? 'high' : 'medium',
      },
      decorations: (classification.decorationTags || []).map((tag) => ({
        type: tag,
        purpose: 'visual accent',
        emotion: classification.visualStyle,
      })),
      designRules: [
        raw.concept ? `Rule 1: ${raw.concept}` : null,
        raw.why_unique ? `Rule 2: ${raw.why_unique}` : null,
      ].filter(Boolean),
    };

    results.push({ hash: id, knowledge });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  const counts = [...TARGET_FAMILIES].map((f) => `${f}: ${results.filter((r) => r.knowledge.layoutFamily.value === f).length}`);
  console.log(`Mapped ${results.length} entries -> ${OUTPUT_FILE}`);
  console.log(counts.join(', '));
}

main();
