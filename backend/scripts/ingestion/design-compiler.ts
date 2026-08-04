/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';

// Target Output Interfaces
type LayoutAnchor = 'center' | 'top_left' | 'top_right' | 'top_center' | 'bottom_left' | 'bottom_right' | 'bottom_center' | 'middle_left' | 'middle_right' | 'center_left' | 'center_right';

interface IDSLBaseLayer {
  id: string;
  zIndex: number;
  orientation?: 'horizontal' | 'vertical';
}
interface IDSLImageLayer extends IDSLBaseLayer {
  type: 'image';
  mask: 'rectangle' | 'circle' | 'arch' | 'die_cut' | 'split' | 'polaroid' | 'before_after_split';
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

// Below: Split / Countdown Promo / Product Showcase — mined from our own vision extraction
// (map-our-extraction-to-knowledge-schema.ts), since the colleague's own extracted_knowledge
// dataset has near-zero coverage for these 3 (10/2/1 raw entries) vs. our 206/135/116. Each
// branches on the real mined readingFlow/negativeSpace to pick between 3 real observed patterns
// per family, same structure as compileEditorial's flow-based branching above.

function compileSplit(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';

  if (flow === 'z-pattern' || flow === 'diagonal') {
    // split_left_right: circle photo right half, heading+tagline bottom-left
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'circle', paddingPercent: 8, anchor: 'middle_right' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_left', alignment: 'left', maxWidthPercent: 45 });
    layers.push({ id: 'tagline', type: 'text', zIndex: 31, role: 'tagline', anchor: 'bottom_left', alignment: 'left', maxWidthPercent: 40 });
  } else if (flow === 'center-outward' || flow === 'circular') {
    // split_vertical_stack: heading block top, circle photo filling the bottom
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'circle', paddingPercent: 10, anchor: 'bottom_center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'top_center', alignment: 'center', maxWidthPercent: 70 });
    layers.push({ id: 'deco', type: 'decoration', zIndex: 20, component: 'split_seam_line', anchor: 'center', offsetPercent: 40 });
  } else {
    // split_horizontal_band: full-width photo band top, solid text block bottom, divider at seam
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0, anchor: 'top_center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'center', alignment: 'center', maxWidthPercent: 80 });
    layers.push({ id: 'deco', type: 'decoration', zIndex: 20, component: 'split_seam_line', anchor: 'top_center', offsetPercent: 33 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileCountdownPromo(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';

  if (flow === 'z-pattern' || flow === 'diagonal') {
    // countdown_promo_frames: text stack left, polaroid-style photo right, urgency badge
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'polaroid', paddingPercent: 5, anchor: 'middle_right' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'middle_left', alignment: 'left', maxWidthPercent: 55 });
    layers.push({ id: 'deco', type: 'decoration', zIndex: 35, component: 'countdown_urgency_badge', anchor: 'bottom_right', offsetPercent: 5 });
  } else if (k.composition.negativeSpace === 'large') {
    // countdown_promo_circle: circle photo centered, minimal decoration, tight negative space
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'circle', paddingPercent: 15, anchor: 'center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 70 });
  } else {
    // countdown_promo_headline: photo left half, single large centered headline right half
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0, anchor: 'middle_left' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'middle_right', alignment: 'center', maxWidthPercent: 40 });
    layers.push({ id: 'deco', type: 'decoration', zIndex: 20, component: 'countdown_urgency_badge', anchor: 'bottom_right', offsetPercent: 8 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileProductShowcase(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';

  if (flow === 'center-outward' || flow === 'circular') {
    // product_showcase_halo: circle product photo with a decorative halo ring behind it
    layers.push({ id: 'ring', type: 'decoration', zIndex: 5, component: 'product_halo_ring', anchor: 'center', offsetPercent: 0 });
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'circle', paddingPercent: 20, anchor: 'center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 70 });
  } else if (flow === 'center-down') {
    // product_showcase_band: heading/tagline band over a photo starting mid-canvas, divider + CTA
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0, anchor: 'bottom_center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'top_center', alignment: 'center', maxWidthPercent: 80 });
    layers.push({ id: 'deco', type: 'decoration', zIndex: 20, component: 'split_seam_line', anchor: 'center', offsetPercent: 40 });
  } else {
    // product_showcase_overlay: full-bleed background photo, headline overlaid on top
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0, anchor: 'center' });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'top_center', alignment: 'center', maxWidthPercent: 80 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

// Below: Before/After / Scrapbook / Quadrant — mined from our own vision extraction, same as
// Split/Countdown Promo/Product Showcase above. before_after uses the genuine two-photo
// (before_after_split) mask added to the app's DSL renderer — a real before-photo and a real
// after-photo stitched together, not a single-photo crop.

function compileBeforeAfter(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';

  if (flow === 'center-outward' || flow === 'circular') {
    // before_after_stacked: horizontal seam (before top, after bottom)
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'before_after_split', orientation: 'horizontal', paddingPercent: 0, anchor: 'center' });
    layers.push({ id: 'arrow', type: 'decoration', zIndex: 25, component: 'transformation_arrow', orientation: 'horizontal', anchor: 'center', offsetPercent: 0 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 80 });
  } else if (flow === 'z-pattern' || flow === 'diagonal' || flow === 'asymmetric') {
    // before_after_labeled: vertical seam with a tape accent, offset heading+tagline
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'before_after_split', orientation: 'vertical', paddingPercent: 5, anchor: 'center' });
    layers.push({ id: 'tape', type: 'decoration', zIndex: 35, component: 'editorial_tape', anchor: 'top_center', offsetPercent: 0 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'top_center', alignment: 'center', maxWidthPercent: 70 });
    layers.push({ id: 'tagline', type: 'text', zIndex: 31, role: 'tagline', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 60 });
  } else {
    // before_after_side_by_side: vertical seam (before left, after right), heading below
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'before_after_split', orientation: 'vertical', paddingPercent: 0, anchor: 'center' });
    layers.push({ id: 'arrow', type: 'decoration', zIndex: 25, component: 'transformation_arrow', orientation: 'vertical', anchor: 'center', offsetPercent: 0 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 80 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileScrapbook(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];

  if (k.composition.negativeSpace === 'large' || k.composition.negativeSpace === 'moderate') {
    // scrapbook_journal_entry: inset photo beside margin notes, more breathing room
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 12, anchor: 'middle_left' });
    layers.push({ id: 'notes', type: 'decoration', zIndex: 20, component: 'margin_notes', anchor: 'middle_right', offsetPercent: 5 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'middle_right', alignment: 'left', maxWidthPercent: 40 });
  } else {
    // scrapbook_collage: taped polaroid photo with torn-paper texture, tight negative space (the observed default)
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'polaroid', paddingPercent: 8, anchor: 'top_center' });
    layers.push({ id: 'tape', type: 'decoration', zIndex: 35, component: 'editorial_tape', anchor: 'top_center', offsetPercent: 0 });
    layers.push({ id: 'torn', type: 'decoration', zIndex: 5, component: 'torn_paper', anchor: 'bottom_center', offsetPercent: 0 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 75 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileQuadrant(k: IExtractedKnowledge, id: string): ICompiledLayoutDSL {
  const layers: IDSLSceneLayer[] = [];
  const flow = k.composition.readingFlow || 'center-down';

  if (flow === 'circular' || flow === 'center-outward') {
    // quadrant_badge_focus: arch photo, prominent geometric badge, grain texture
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'arch', paddingPercent: 10, anchor: 'center' });
    layers.push({ id: 'badge', type: 'decoration', zIndex: 35, component: 'geometric_badge', anchor: 'top_left', offsetPercent: 5 });
    layers.push({ id: 'grain', type: 'decoration', zIndex: 5, component: 'grain_overlay', anchor: 'center', offsetPercent: 0 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_center', alignment: 'center', maxWidthPercent: 70 });
  } else {
    // quadrant_grid: full photo with a subtle grid overlay evoking a 4-panel structure, corner badge
    layers.push({ id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 0, anchor: 'center' });
    layers.push({ id: 'grid', type: 'decoration', zIndex: 20, component: 'minimal_grid', anchor: 'center', offsetPercent: 0 });
    layers.push({ id: 'badge', type: 'decoration', zIndex: 35, component: 'geometric_badge', anchor: 'top_right', offsetPercent: 5 });
    layers.push({ id: 'heading', type: 'text', zIndex: 30, role: 'heading', anchor: 'bottom_left', alignment: 'left', maxWidthPercent: 60 });
  }
  return { schemaVersion: "1.0", layoutVersion: "1.0", id, base: "universal_dynamic_base", layers };
}

function compileFamily(family: string, k: IExtractedKnowledge, layoutId: string): ICompiledLayoutDSL | null {
  if (family === 'editorial') return compileEditorial(k, layoutId);
  if (family === 'minimalist_quote') return compileMinimalistQuote(k, layoutId);
  if (family === 'text_only') return compileTextOnly(k, layoutId);
  if (family === 'testimonial') return compileTestimonial(k, layoutId);
  if (family === 'clinical_hero') return compileClinicalHero(k, layoutId);
  if (family === 'split') return compileSplit(k, layoutId);
  if (family === 'countdown_promo') return compileCountdownPromo(k, layoutId);
  if (family === 'product_showcase') return compileProductShowcase(k, layoutId);
  if (family === 'before_after') return compileBeforeAfter(k, layoutId);
  if (family === 'scrapbook') return compileScrapbook(k, layoutId);
  if (family === 'quadrant') return compileQuadrant(k, layoutId);
  return null;
}

function run() {
  console.log("Starting Phase 6: Deterministic Procedural Compiler (additive mode)");

  const outputPath = path.join(__dirname, '../../src/ai/config/compiled-layouts.v2.json');
  const mapPath = path.join(__dirname, '../../src/ai/config/design-knowledge-map.json');

  // ADDITIVE: load the existing, already-live output files as the base rather than regenerating
  // from scratch. The original script derived every id from a single counter shared across the
  // whole input array (`layout_v2_${family}_${flow}_${count}`) — recognizing 3 new families
  // shifts which entries hit the counter at which point, silently renaming/altering ~150 of the
  // 216 pre-existing entries. Loading the existing files verbatim and only adding new keys avoids
  // that entirely; nothing pre-existing is touched.
  const finalLayouts: Record<string, ICompiledLayoutDSL> = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {};
  const knowledgeMap: Record<string, IExtractedKnowledge> = fs.existsSync(mapPath)
    ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const existingCount = Object.keys(finalLayouts).length;

  let added = 0;

  function addEntries(items: { hash: string, knowledge: IExtractedKnowledge }[], counterPrefix: string) {
    let count = 1;
    for (const item of items) {
      const k = item.knowledge;
      const family = k.layoutFamily?.value;
      const flow = k.composition?.readingFlow ? k.composition.readingFlow.replace('-', '_') : 'default';
      const layoutId = `layout_v2_${family}_${flow}_${counterPrefix}${count}`.toLowerCase();

      const dsl = compileFamily(family, k, layoutId);
      if (dsl) {
        finalLayouts[layoutId] = dsl;
        knowledgeMap[layoutId] = k;
        count++;
        added++;
      }
    }
  }

  // 1. Our own mined data for split/countdown_promo/product_showcase (the vast majority of new coverage).
  const ourInputPath = path.join(__dirname, 'our_knowledge_normalized.json');
  if (fs.existsSync(ourInputPath)) {
    const ours: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(ourInputPath, 'utf8'));
    addEntries(ours, 'own_');
    console.log(`Added ${ours.length} entries from our own extraction (split/countdown_promo/product_showcase).`);
  }

  // 2. The colleague's own extracted_knowledge_normalized.json already contains a handful of raw
  // split/countdown_promo/product_showcase entries (10/2/1) that were silently dropped before
  // (no compile function existed for them). Pick up ONLY those newly-recognized ones — every
  // other family in this file is left completely untouched (not reprocessed at all).
  const inputPath = path.join(__dirname, 'extracted_knowledge_normalized.json');
  if (fs.existsSync(inputPath)) {
    const results: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const previouslyDropped = results.filter((item) =>
      ['split', 'countdown_promo', 'product_showcase'].includes(item.knowledge.layoutFamily?.value));
    addEntries(previouslyDropped, 'colleague_');
    console.log(`Recovered ${previouslyDropped.length} previously-dropped entries from the colleague's own dataset.`);
  }

  // 3. Second batch of new families (before_after/testimonial/scrapbook/quadrant) — a SEPARATE
  // input file (our_knowledge_normalized_batch2.json) and a distinct counterPrefix ('own2_') so
  // this can never shift the counter, and therefore the ids, of the split/countdown_promo/
  // product_showcase entries added in step 1 above. testimonial already had a working
  // compileFamily() dispatch (colleague's original 15 entries were compiled long before this
  // additive-mode script existed) — this only adds our own 24 extra real testimonial entries on
  // top, under new own2_ ids; the colleague's original testimonial entries are untouched.
  const ourBatch2Path = path.join(__dirname, 'our_knowledge_normalized_batch2.json');
  if (fs.existsSync(ourBatch2Path)) {
    const ours2: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(ourBatch2Path, 'utf8'));
    addEntries(ours2, 'own2_');
    console.log(`Added ${ours2.length} entries from our own extraction (before_after/testimonial/scrapbook/quadrant).`);
  }

  // 4. Recover the colleague's own before_after(3)/scrapbook(2)/quadrant(2) entries the same way
  // step 2 recovered split/countdown_promo/product_showcase — these had no compile function until
  // now either. testimonial is deliberately excluded here: its colleague entries were already
  // compiled in the original (pre-additive) run, recovering them again would create duplicates.
  if (fs.existsSync(inputPath)) {
    const results2: { hash: string, knowledge: IExtractedKnowledge }[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const previouslyDropped2 = results2.filter((item) =>
      ['before_after', 'scrapbook', 'quadrant'].includes(item.knowledge.layoutFamily?.value));
    addEntries(previouslyDropped2, 'colleague2_');
    console.log(`Recovered ${previouslyDropped2.length} previously-dropped entries from the colleague's own dataset (before_after/scrapbook/quadrant).`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalLayouts, null, 2), 'utf8');
  fs.writeFileSync(mapPath, JSON.stringify(knowledgeMap, null, 2), 'utf8');

  console.log(`Existing entries preserved untouched: ${existingCount}`);
  console.log(`New entries added: ${added}`);
  console.log(`Total: ${Object.keys(finalLayouts).length}`);
  console.log(`Saved to: ${outputPath}`);
}

run();
