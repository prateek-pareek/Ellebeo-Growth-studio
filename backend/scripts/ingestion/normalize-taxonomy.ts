import * as fs from 'fs';
import * as path from 'path';

interface IExtractedKnowledge {
  layoutFamily: { value: string; confidence: number; };
  visualLanguage: { style: string; energy: string; tone: string; industry: string; };
  composition: { primaryFocus: string; secondaryFocus: string; readingFlow: string; balance: string; negativeSpace: string; };
  typography: { headlineStyle: string; hierarchy: string; tracking: string; lineBreakStrategy: string; contrast: string; };
  decorations: Array<{ type: string; purpose: string; emotion: string; }>;
  designRules: string[];
}

function normalize(value: string, map: Record<string, string[]>): string {
  if (!value) return value;
  const lower = value.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(map)) {
    if (canonical === lower || aliases.includes(lower)) {
      return canonical;
    }
  }
  return lower;
}

async function run() {
  console.log("Starting Phase 5: Taxonomy Normalization...");

  const inputPath = path.join(__dirname, 'extracted_knowledge.json');
  const outputPath = path.join(__dirname, 'extracted_knowledge_normalized.json');

  if (!fs.existsSync(inputPath)) {
    console.error("extracted_knowledge.json not found!");
    return;
  }

  const results: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const layoutFamilyMap: Record<string, string[]> = {
    'testimonial': ['testimonial_card', 'testimonial_quote', 'testimonial_list'],
    'polaroid': ['polaroid_collage'],
    'scrapbook': ['scrapbook_collage'],
    'quadrant': ['quadrant_info'],
    'split': ['comparison_split', 'luxury_split']
  };

  const decorationMap: Record<string, string[]> = {
    'paper_clip': ['paperclip', 'clip'],
    'shadow': ['drop_shadow', 'soft_shadow', 'shadow_overlay', 'shadow_effect'],
    'butterfly': ['butterfly illustration', 'heart and butterfly', 'floral and butterfly elements', 'floral butterfly'],
    'quotation_marks': ['quote_marks'],
    'floral': ['flower', 'floral_illustration', 'floral_elements'],
    'doodle': ['doodles', 'hand-drawn elements'],
    'circle': ['circular_shape', 'geometric_circle', 'hand-drawn circle'],
    'heart': ['heart graphic', 'heart illustration']
  };

  const readingFlowMap: Record<string, string[]> = {
    'center-down': ['vertical', 'e.g., vertical']
  };

  for (const result of results) {
    const k = result.knowledge;
    
    // Normalize Layout Family
    if (k.layoutFamily && k.layoutFamily.value) {
      k.layoutFamily.value = normalize(k.layoutFamily.value, layoutFamilyMap);
    }

    // Normalize Reading Flow
    if (k.composition && k.composition.readingFlow) {
      k.composition.readingFlow = normalize(k.composition.readingFlow, readingFlowMap);
    }

    // Normalize Decorations
    if (k.decorations && Array.isArray(k.decorations)) {
      for (const dec of k.decorations) {
        if (dec.type) {
          dec.type = normalize(dec.type, decorationMap);
        }
      }
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Successfully normalized ${results.length} layouts.`);
  console.log(`Saved pristine knowledge graph to: ${outputPath}`);
}

run().catch(console.error);
