import { CompositionEngine } from '../src/ai/services/template-engine/engines/composition-engine';
import { ArtDirectionEngine } from '../src/ai/services/template-engine/engines/art-direction-engine';
import { ThemeEngine } from '../src/ai/services/template-engine/engines/theme-engine';
import { GeometryCompiler } from '../src/ai/services/template-engine/engines/geometry-compiler';
import { DesignCompiler } from '../src/ai/services/template-engine/engines/design-compiler';
import { LayoutEngine } from '../src/ai/services/template-engine/engines/layout-engine';
import { CompositionOptimizer } from '../src/ai/services/template-engine/engines/composition-optimizer';

// Throwaway verification: runs each of the 9 new variant ids through the exact same engine
// chain ai-image-generation.service.ts uses for procedural families, with no real image/brand
// data — just confirming every stage returns without throwing and produces sane geometry.

const NEW_FAMILY_IDS = [
  'split_vertical_stack', 'split_horizontal_band', 'split_left_right',
  'countdown_promo_frames', 'countdown_promo_headline', 'countdown_promo_circle',
  'product_showcase_overlay', 'product_showcase_halo', 'product_showcase_band',
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

for (const id of NEW_FAMILY_IDS) {
  try {
    // 1. Build the recipe (same call the LayoutAssemblerService makes)
    const dsl = compositionEngine.buildRecipe(id, 0, 'Test Brand');
    if (!dsl.layers || dsl.layers.length === 0) throw new Error('No layers produced');

    // 2. Art direction + theme (same as ai-image-generation.service.ts)
    const intent = artDirectionEngine.generateDesignIntent(id);
    const behavior = artDirectionEngine.mapIntentToBehavior(intent);
    const designLanguage = { intent, behavior };
    const tokens = themeEngine.resolveDesignTokens(['quiet_luxury']);

    // 3. Geometry compile
    const designSpec = {
      composition: { hero: 'image' as const, balance: 'asymmetrical' as const, negativeSpace: 'medium' as const },
      photo: { role: 'hero' as const, treatment: 'framed' as const },
      typography: { hierarchy: 'editorial' as const, dominance: 'high' as const },
      decorations: { density: 'medium' as const },
      style: { mood: 'premium' },
    };
    geometryCompiler.compile(designLanguage as any, CANVAS_W, CANVAS_H, designSpec as any);

    // 4. Design compiler mutation
    const compiledDsl = designCompiler.compile(dsl, designLanguage as any);

    // 5. Layout constraints (no face detected -> no collision to resolve, still must not throw)
    const layoutEngine = new LayoutEngine(CANVAS_W, CANVAS_H);
    const constraints = layoutEngine.calculateConstraints('editorial', 'balanced', false, behavior);

    // 6. Composition optimizer (this is where allowedAnchors variant-picking happens)
    const optimized = compositionOptimizer.optimize(compiledDsl, constraints as any, CANVAS_W, CANVAS_H);

    const layerSummary = optimized.layers.map((l: any) => `${l.type}:${l.id}@${l.anchor}`).join(', ');
    console.log(`[OK] ${id} -> ${optimized.layers.length} layers (${layerSummary})`);
  } catch (err: any) {
    failures++;
    console.error(`[FAIL] ${id}:`, err?.message || err);
  }
}

console.log(`\n${NEW_FAMILY_IDS.length - failures}/${NEW_FAMILY_IDS.length} new variants passed the full engine chain.`);
if (failures > 0) process.exit(1);
