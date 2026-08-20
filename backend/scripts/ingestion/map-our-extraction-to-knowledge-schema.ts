import * as fs from 'fs';
import * as path from 'path';

// Adapter: reads OUR vision-extraction output (template-library-extracted.json +
// design-knowledge-graph-per-template.json, produced earlier this session) and remaps it into the
// EXACT `IExtractedKnowledge` shape design-compiler.ts expects, so the 3 new families
// (split/countdown_promo/product_showcase) can flow through the same real compiler that already
// produces compiled-layouts.v2.json + design-knowledge-map.json for editorial/etc. Pure local
// transform, no AI calls — the vision extraction already happened.

const EXTRACTED_FILE = path.join(__dirname, '../output/template-library-extracted.json');
const PER_TEMPLATE_FILE = path.join(__dirname, '../output/design-knowledge-graph-per-template.json');
const OUTPUT_FILE = path.join(__dirname, 'our_knowledge_normalized.json');

const TARGET_FAMILIES = new Set(['split', 'countdown_promo', 'product_showcase']);

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

// Same lightweight typography-string parsing spirit as generate-design-knowledge-graph.ts,
// reduced to the fields design-compiler.ts's IExtractedKnowledge.typography actually wants.
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
        readingFlow: classification.readingFlow, // already hyphenated (e.g. "z-pattern"), matches design-compiler.ts's expected format
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
