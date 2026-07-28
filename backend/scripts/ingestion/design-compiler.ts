import * as fs from 'fs';
import * as path from 'path';

// Target Output Interfaces
type LayoutAnchor = 'center' | 'top_left' | 'top_right' | 'top_center' | 'bottom_left' | 'bottom_right' | 'bottom_center' | 'middle_left' | 'middle_right' | 'center_left' | 'center_right';

interface IDSLBaseLayer {
  id: string;
  zIndex: number;
}
interface IDSLImageLayer extends IDSLBaseLayer {
  type: 'image';
  mask: 'rectangle' | 'circle' | 'arch' | 'die_cut' | 'split' | 'polaroid';
  paddingPercent: number;
  anchor?: LayoutAnchor;
  offsetPercent?: number;
}
interface IDSLTextLayer extends IDSLBaseLayer {
  type: 'text';
  role: 'heading' | 'tagline' | 'body';
  anchor: LayoutAnchor;
  alignment: 'left' | 'center' | 'right';
  maxWidthPercent: number;
  offsetPercent?: number;
}
interface IDSLDecorationLayer extends IDSLBaseLayer {
  type: 'decoration';
  component: string;
  anchor: LayoutAnchor;
  offsetPercent: number;
}
type IDSLSceneLayer = IDSLImageLayer | IDSLDecorationLayer | IDSLTextLayer;

interface ICompiledLayoutDSL {
  schemaVersion: "1.0";
  layoutVersion: "1.0";
  id: string;
  base: string;
  layers: IDSLSceneLayer[];
}

// Input Knowledge Graph Interfaces
interface IExtractedKnowledge {
  layoutFamily: { value: string; confidence: number; };
  visualLanguage: { style: string; energy: string; tone: string; industry: string; };
  composition: { primaryFocus: string; secondaryFocus: string; readingFlow: string; balance: string; negativeSpace: string; };
  typography: { headlineStyle: string; hierarchy: string; tracking: string; lineBreakStrategy: string; contrast: string; };
  decorations: Array<{ type: string; purpose: string; emotion: string; }>;
}

function compileEditorial(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';
  
  if (flow === 'z-pattern' || flow === 'diagonal') {
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 5, anchor: 'middle_right', offsetPercent: 5 });
    layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'middle_left', alignment: 'left', maxWidthPercent: 40, offsetPercent: 5 });
  } else {
    // center-down
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0 });
    layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 80, offsetPercent: 10 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "solid_canvas_full", layers };
}

function compileMinimalistQuote(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 15, anchor: 'top_center', offsetPercent: 5 });
  layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 70, offsetPercent: 15 });
  
  if (k.decorations && k.decorations.length > 0) {
    const dec = k.decorations[0].type;
    layers.push({ id: 'deco', type: 'decoration', zIndex: 40, component: dec, anchor: 'top_center', offsetPercent: 10 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileTextOnly(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'center', alignment: 'center', maxWidthPercent: 80 });
  if (k.decorations && k.decorations.length > 0) {
    layers.push({ id: 'deco', type: 'decoration', zIndex: 40, component: k.decorations[0].type, anchor: 'top_left', offsetPercent: 10 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "solid_canvas_full", layers };
}

function compileTestimonial(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'circle', paddingPercent: 20, anchor: 'top_center', offsetPercent: 5 });
  layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 60, offsetPercent: 15 });
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "solid_canvas_full", layers };
}

function compileClinicalHero(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'split', paddingPercent: 0, anchor: 'middle_right' });
  layers.push({ id: 'txt', type: 'text', zIndex: 30, role: 'heading', anchor: 'middle_left', alignment: 'left', maxWidthPercent: 45, offsetPercent: 10 });
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "split_before_after", layers };
}

function run() {
  console.log("Starting Phase 6: Deterministic Procedural Compiler");
  
  const inputPath = path.join(__dirname, 'extracted_knowledge_normalized.json');
  const outputPath = path.join(__dirname, '../../src/ai/config/compiled-layouts.v2.json');

  if (!fs.existsSync(inputPath)) {
    console.error("extracted_knowledge_normalized.json not found!");
    return;
  }

  const results: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const finalLayouts: Record<string, ICompiledLayoutDSL> = {};
  const knowledgeMap: Record<string, IExtractedKnowledge> = {};

  let count = 1;
  for (const item of results) {
    const k = item.knowledge;
    const family = k.layoutFamily?.value;
    
    // Generate a unique, descriptive layout ID based on the psychology
    const flow = k.composition?.readingFlow ? k.composition.readingFlow.replace('-', '_') : 'default';
    const layoutId = `layout_v2_${family}_${flow}_${count}`.toLowerCase();
    
    let dsl: ICompiledLayoutDSL | null = null;
    if (family === 'editorial') {
      dsl = compileEditorial(k, layoutId);
    } else if (family === 'minimalist_quote') {
      dsl = compileMinimalistQuote(k, layoutId);
    } else if (family === 'text_only') {
      dsl = compileTextOnly(k, layoutId);
    } else if (family === 'testimonial') {
      dsl = compileTestimonial(k, layoutId);
    } else if (family === 'clinical_hero') {
      dsl = compileClinicalHero(k, layoutId);
    }

    if (dsl) {
      finalLayouts[layoutId] = dsl;
      knowledgeMap[layoutId] = k; // Store the rich knowledge linked to this specific layoutId
      count++;
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalLayouts, null, 2), 'utf8');
  
  // NEW: Save the Semantic Knowledge Map so the Art Direction Engine can access it at runtime!
  const mapPath = path.join(__dirname, '../../src/ai/config/design-knowledge-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(knowledgeMap, null, 2), 'utf8');
  
  console.log(`Successfully compiled ${Object.keys(finalLayouts).length} dynamic layout algorithms!`);
  console.log(`Saved compiled engine configuration to: ${outputPath}`);
}

run();
