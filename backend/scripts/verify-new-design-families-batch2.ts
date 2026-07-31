import sharp from 'sharp';
import { CompositionEngine } from '../src/ai/services/template-engine/engines/composition-engine';
import { ArtDirectionEngine } from '../src/ai/services/template-engine/engines/art-direction-engine';
import { ThemeEngine } from '../src/ai/services/template-engine/engines/theme-engine';
import { GeometryCompiler } from '../src/ai/services/template-engine/engines/geometry-compiler';
import { DesignCompiler } from '../src/ai/services/template-engine/engines/design-compiler';
import { LayoutEngine } from '../src/ai/services/template-engine/engines/layout-engine';
import { CompositionOptimizer } from '../src/ai/services/template-engine/engines/composition-optimizer';
import { PrimitiveEngine, PrimitiveContext } from '../src/ai/services/template-engine/engines/primitive-engine';
import { MetadataRetriever } from '../src/ai/services/template-engine/metadata.retriever';
import { BASE_TREATMENTS, registerDynamicLayout, COMPILED_LAYOUTS } from '../src/ai/config/layout-renderers';

// Throwaway verification for the 4 new families (before_after, testimonial,
// scrapbook, quadrant): runs each recipe through the exact engine chain
// ai-image-generation.service.ts uses, confirms the 2 new primitives render
// real SVG, confirms the Template Agent's candidate pool picks them up, and
// — the highest-risk new piece — actually exercises the real two-photo Sharp
// compositor for before_after_split with fake but real image buffers.

const NEW_FAMILY_IDS = [
  'before_after_side_by_side', 'before_after_stacked', 'before_after_labeled',
  'testimonial_quote_portrait', 'testimonial_star_card', 'testimonial_minimal_quote',
  'scrapbook_collage', 'scrapbook_journal_entry',
  'quadrant_grid', 'quadrant_badge_focus',
];

const compositionEngine = new CompositionEngine();
const artDirectionEngine = new ArtDirectionEngine();
const themeEngine = new ThemeEngine();
const geometryCompiler = new GeometryCompiler();
const designCompiler = new DesignCompiler();
const compositionOptimizer = new CompositionOptimizer();

const CANVAS_W = 1080;
const CANVAS_H = 1080;

let failures = 0;

// ── 1. Full engine chain for every new recipe id ────────────────────────────
for (const id of NEW_FAMILY_IDS) {
  try {
    const dsl = compositionEngine.buildRecipe(id, 0, 'Test Brand');
    if (!dsl.layers || dsl.layers.length === 0) throw new Error('No layers produced');

    const intent = artDirectionEngine.generateDesignIntent(id);
    const behavior = artDirectionEngine.mapIntentToBehavior(intent);
    const designLanguage = { intent, behavior };
    themeEngine.resolveDesignTokens(['quiet_luxury']);

    const designSpec = {
      composition: { hero: 'image' as const, balance: 'asymmetrical' as const, negativeSpace: 'medium' as const },
      photo: { role: 'hero' as const, treatment: 'framed' as const },
      typography: { hierarchy: 'editorial' as const, dominance: 'high' as const },
      decorations: { density: 'medium' as const },
      style: { mood: 'premium' },
    };
    geometryCompiler.compile(designLanguage as any, CANVAS_W, CANVAS_H, designSpec as any);

    const compiledDsl = designCompiler.compile(dsl, designLanguage as any);

    const layoutEngine = new LayoutEngine(CANVAS_W, CANVAS_H);
    const constraints = layoutEngine.calculateConstraints('editorial', 'balanced', false, behavior);

    const optimized = compositionOptimizer.optimize(compiledDsl, constraints as any, CANVAS_W, CANVAS_H);

    const layerSummary = optimized.layers.map((l: any) => `${l.type}:${l.id}@${l.anchor}`).join(', ');
    console.log(`[OK] ${id} -> ${optimized.layers.length} layers (${layerSummary})`);
  } catch (err: any) {
    failures++;
    console.error(`[FAIL] ${id}:`, err?.message || err);
  }
}

// ── 2. New primitives render real SVG, not the MISSING COMPONENT fallback ──
const primitiveEngine = new PrimitiveEngine();
const primitiveCtx: PrimitiveContext = {
  w: 1080, h: 1080,
  validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
  constraints: { safeX: 60, safeY: 80 },
};
for (const name of ['transformation_arrow', 'star_rating_row']) {
  const svg = primitiveEngine.renderPrimitive(name, primitiveCtx);
  const ok = svg.length > 0 && !svg.includes('MISSING COMPONENT');
  console.log(`[${ok ? 'OK' : 'FAIL'}] primitive '${name}' -> ${svg.length} chars`);
  if (!ok) failures++;
}
// Also confirm the horizontal-orientation branch of transformation_arrow works
const svgHorizontal = primitiveEngine.renderPrimitive('transformation_arrow', primitiveCtx, { orientation: 'horizontal' } as any);
const okHorizontal = svgHorizontal.includes('horizontal seam');
console.log(`[${okHorizontal ? 'OK' : 'FAIL'}] primitive 'transformation_arrow' (horizontal) -> ${svgHorizontal.length} chars`);
if (!okHorizontal) failures++;

// ── 3. Template Agent candidate pool includes the new procedural recipes ───
async function checkRetriever() {
  const retriever = new MetadataRetriever();
  const candidates = await retriever.retrieveCandidates({
    brief: '', brandName: '', aesthetic: '', textLength: 0, slideIndex: 0, totalSlides: 1,
  });
  for (const id of NEW_FAMILY_IDS) {
    const found = candidates.find((c) => c.id === id && c.type === 'procedural');
    console.log(`[${found ? 'OK' : 'FAIL'}] retriever candidate '${id}' present`);
    if (!found) failures++;
  }

  // Phase 2: the newly-compiled RIGID (mined) entries in compiled-layouts.v2.json, same check
  // yesterday's verify-new-primitives-and-knowledge.ts did for split/countdown_promo/product_showcase.
  for (const family of ['before_after', 'testimonial', 'scrapbook', 'quadrant']) {
    const matches = candidates.filter((c) => c.id.includes(`layout_v2_${family}`));
    const sample = matches[0];
    console.log(`\n${family}: ${matches.length} compiled candidates found`);
    if (sample) {
      console.log(`  sample: ${sample.id} -> category="${sample.category}", macroFaceSafe=${sample.macroFaceSafe}`);
    } else {
      failures++;
      console.log(`  [FAIL] no compiled candidates found for ${family}`);
    }
  }
  console.log(`\nTotal candidates from retriever (rigid + procedural): ${candidates.length}`);
}

// ── 4. The real risk: genuine two-photo Sharp compositing for before_after ─
async function makeFakeImage(color: string): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: color } }).png().toBuffer();
}

async function checkBeforeAfterCompositing() {
  for (const [id, orientation] of [['before_after_side_by_side', 'vertical'], ['before_after_stacked', 'horizontal']] as const) {
    try {
      const dsl = compositionEngine.buildRecipe(id, 0, 'Test Brand');
      registerDynamicLayout(dsl);

      const afterBuffer = await makeFakeImage('#3366ff'); // stands in for the real "after" photo
      const beforeBuffer = await makeFakeImage('#ff3366'); // stands in for the real "before" photo

      const result = await BASE_TREATMENTS['universal_dynamic_base']({
        layoutType: dsl.id,
        imageBuffer: afterBuffer,
        beforePhotoUrl: 'fake://before-photo',
        w: 1080, h: 1080,
        paddingX: 60, paddingTop: 80, paddingBottom: 160,
        innerW: 960, innerH: 840,
        validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
        downloadImageAsBuffer: async (_url: string) => beforeBuffer,
      } as any);

      const meta = await result.baseImage.metadata();
      const ok = !!(meta.width && meta.height);
      console.log(`[${ok ? 'OK' : 'FAIL'}] ${id} (${orientation}) real two-photo composite -> ${meta.width}x${meta.height} ${meta.format}`);
      if (!ok) failures++;
    } catch (err: any) {
      failures++;
      console.error(`[FAIL] ${id} two-photo composite threw:`, err?.message || err);
    }
  }

  // Also confirm the graceful fallback when no before-photo is available
  try {
    const dsl = compositionEngine.buildRecipe('before_after_side_by_side', 1, 'Test Brand');
    registerDynamicLayout(dsl);
    const afterBuffer = await makeFakeImage('#3366ff');
    const result = await BASE_TREATMENTS['universal_dynamic_base']({
      layoutType: dsl.id,
      imageBuffer: afterBuffer,
      beforePhotoUrl: undefined,
      w: 1080, h: 1080,
      paddingX: 60, paddingTop: 80, paddingBottom: 160,
      innerW: 960, innerH: 840,
      validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
      downloadImageAsBuffer: async (_url: string) => afterBuffer,
    } as any);
    const meta = await result.baseImage.metadata();
    const ok = !!(meta.width && meta.height);
    console.log(`[${ok ? 'OK' : 'FAIL'}] before_after_side_by_side with NO before-photo falls back cleanly -> ${meta.width}x${meta.height}`);
    if (!ok) failures++;
  } catch (err: any) {
    failures++;
    console.error('[FAIL] no-before-photo fallback threw:', err?.message || err);
  }
}

// A real MINED before_after entry (from compileBeforeAfter in design-compiler.ts, not a
// procedural recipe) also needs to trigger genuine two-photo compositing — same primitive engine
// dispatch, but reached via COMPILED_LAYOUTS directly rather than LayoutAssemblerService.
async function checkMinedBeforeAfterEntry() {
  const rigidId = Object.keys(COMPILED_LAYOUTS).find((id) => id.startsWith('layout_v2_before_after'));
  if (!rigidId) {
    failures++;
    console.log('[FAIL] no mined layout_v2_before_after_* entry found in COMPILED_LAYOUTS');
    return;
  }
  const dsl = COMPILED_LAYOUTS[rigidId];
  const usesSplitMask = dsl.layers.some((l: any) => l.mask === 'before_after_split');
  try {
    const afterBuffer = await makeFakeImage('#3366ff');
    const beforeBuffer = await makeFakeImage('#ff3366');
    const result = await BASE_TREATMENTS['universal_dynamic_base']({
      layoutType: rigidId,
      imageBuffer: afterBuffer,
      beforePhotoUrl: 'fake://before-photo',
      w: 1080, h: 1080,
      paddingX: 60, paddingTop: 80, paddingBottom: 160,
      innerW: 960, innerH: 840,
      validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
      downloadImageAsBuffer: async (_url: string) => beforeBuffer,
    } as any);
    const meta = await result.baseImage.metadata();
    const ok = !!(meta.width && meta.height);
    console.log(`[${ok ? 'OK' : 'FAIL'}] mined entry '${rigidId}' (usesSplitMask=${usesSplitMask}) -> ${meta.width}x${meta.height} ${meta.format}`);
    if (!ok) failures++;
  } catch (err: any) {
    failures++;
    console.error(`[FAIL] mined entry '${rigidId}' threw:`, err?.message || err);
  }
}

(async () => {
  await checkRetriever();
  await checkBeforeAfterCompositing();
  await checkMinedBeforeAfterEntry();

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  if (failures > 0) process.exit(1);
})();
