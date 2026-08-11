import * as fs from 'fs';
import * as path from 'path';

// Adapter for the THIRD batch — round 2 of vision extraction (gemini-2.5-flash), 1040 new
// templates. Unlike batch1/batch2 (which each targeted a specific subset of families because
// design-compiler.ts only had compile functions for those at the time), this batch targets ALL
// families: design-compiler.ts now has a compile function for every family the classifier can
// produce (transformation/polaroid/notification_card/announcement/magazine were added alongside
// this script specifically so nothing from this batch gets silently dropped).
//
// Scoped strictly to round-2 entries via extractionModel === 'gemini-2.5-flash' — round-1 entries
// are already compiled and must never be reprocessed/re-added here. Separate output file + a
// distinct counterPrefix ('batch3_') in design-compiler.ts's run(), same reasoning as batch2's
// header comment: never share a counter with ids that are already live.

const EXTRACTED_FILE = path.join(__dirname, '../output/template-library-extracted.json');
const PER_TEMPLATE_FILE = path.join(__dirname, '../output/design-knowledge-graph-per-template.json');
const OUTPUT_FILE = path.join(__dirname, 'our_knowledge_normalized_batch3.json');

interface OurExtractedEntry {
  sourceFile: string;
  concept: string;
  visual_structure: string;
  typography: string;
  decorative_elements: string[];
  why_unique: string;
  category: string;
  premiumStyleScore: number;
  extractionModel?: string;
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
  let skippedNotGemini = 0;
  let skippedNoRawEntry = 0;

  for (const id of Object.keys(perTemplate)) {
    const raw = extracted[id];
    if (!raw) { skippedNoRawEntry++; continue; }
    if (raw.extractionModel !== 'gemini-2.5-flash') { skippedNotGemini++; continue; }

    const classification = perTemplate[id];

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

  const familyCounts = new Map<string, number>();
  for (const r of results) {
    const f = r.knowledge.layoutFamily.value;
    familyCounts.set(f, (familyCounts.get(f) || 0) + 1);
  }

  console.log(`Mapped ${results.length} round-2 (gemini-2.5-flash) entries -> ${OUTPUT_FILE}`);
  console.log(`Skipped (not gemini-2.5-flash, i.e. round-1): ${skippedNotGemini}`);
  console.log(`Skipped (id in per-template graph but no raw extracted entry): ${skippedNoRawEntry}`);
  console.log('Family breakdown:');
  for (const [f, c] of [...familyCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f}: ${c}`);
  }
}

main();
