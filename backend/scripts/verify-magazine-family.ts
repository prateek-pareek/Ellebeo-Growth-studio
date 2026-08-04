import { CompositionEngine } from '../src/ai/services/template-engine/engines/composition-engine';
import { ArtDirectionEngine } from '../src/ai/services/template-engine/engines/art-direction-engine';
import { ThemeEngine } from '../src/ai/services/template-engine/engines/theme-engine';
import { GeometryCompiler } from '../src/ai/services/template-engine/engines/geometry-compiler';
import { DesignCompiler } from '../src/ai/services/template-engine/engines/design-compiler';
import { LayoutEngine } from '../src/ai/services/template-engine/engines/layout-engine';
import { CompositionOptimizer } from '../src/ai/services/template-engine/engines/composition-optimizer';
import { PrimitiveEngine, PrimitiveContext } from '../src/ai/services/template-engine/engines/primitive-engine';
import { MetadataRetriever } from '../src/ai/services/template-engine/metadata.retriever';
import { TypographyEngine, TypographyContext } from '../src/ai/services/template-engine/engines/typography-engine';

// Throwaway verification for Phase 2 (Magazine family): runs each of the 3
// new recipes through the exact engine chain ai-image-generation.service.ts
// uses. No new primitives were needed for this family (editorial_sidebar,
// running_header, pull_quote, vertical_label, chapter_tabs, oversized_index
// all pre-existed) so this focuses on recipe wiring + candidate pool + intent.

const NEW_FAMILY_IDS = [
  'magazine_masthead_cover',
  'magazine_pull_quote_spread',
  'magazine_contents_grid',
];

const compositionEngine = new CompositionEngine();
const artDirectionEngine = new ArtDirectionEngine();
const themeEngine = new ThemeEngine();
const geometryCompiler = new GeometryCompiler();
const designCompiler = new DesignCompiler();
const compositionOptimizer = new CompositionOptimizer();
const typographyEngine = new TypographyEngine();
const primitiveEngineForLayers = new PrimitiveEngine();

const SAMPLE_TEXT: Record<string, string> = {
  heading: 'The Reinvention Issue',
  tagline: 'Inside this edition: a full transformation story',
};

const CANVAS_W = 1080;
const CANVAS_H = 1080;

let failures = 0;

for (const id of NEW_FAMILY_IDS) {
  try {
    const dsl = compositionEngine.buildRecipe(id, 0, 'Test Brand');
    if (!dsl.layers || dsl.layers.length === 0) throw new Error('No layers produced');

    const intent = artDirectionEngine.generateDesignIntent(id);
    if (intent.family !== 'magazine') {
      throw new Error(`Expected family 'magazine', got '${intent.family}'`);
    }
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

    const primitiveCtxForLayer: PrimitiveContext = {
      w: CANVAS_W, h: CANVAS_H,
      validBrandColor: '#1a1a1a', validSecondaryColor: '#f5f0eb', validBackgroundColor: '#ffffff',
      validAccentColor: '#d4a373',
      constraints: constraints as any,
      behavior,
      layoutState: { occupiedRegions: [] },
      overlayText: SAMPLE_TEXT.heading,
      rawName: 'Test Brand',
    } as any;
    for (const layer of optimized.layers) {
      if (layer.type === 'text') {
        const typographyCtx: TypographyContext = {
          w: CANVAS_W, h: CANVAS_H,
          brandFont: 'Playfair Display',
          dynamicFontSize: 64,
          dynamicTextColor: '#1a1a1a',
          validSecondaryColor: '#f5f0eb',
          validBackgroundColor: '#ffffff',
          overlayText: SAMPLE_TEXT[(layer as any).role] || 'Sample Text',
          constraints: constraints as any,
          layoutEngine,
        };
        const svg = typographyEngine.renderTextLayer(typographyCtx, layer as any);
        if (!svg || svg.length === 0) throw new Error(`Typography produced empty output for text layer '${layer.id}' (role=${(layer as any).role})`);
      } else if (layer.type === 'decoration') {
        const componentName = (layer as any).component;
        const svg = primitiveEngineForLayers.renderPrimitive(componentName, primitiveCtxForLayer, layer as any);
        if (!svg || svg.includes('MISSING COMPONENT')) throw new Error(`Primitive '${componentName}' failed to render for decoration layer '${layer.id}'`);
      }
    }
    console.log(`      typography + primitives rendered for all ${optimized.layers.length} layers`);
  } catch (err: any) {
    failures++;
    console.error(`[FAIL] ${id}:`, err?.message || err);
  }
}

async function checkRetriever() {
  const retriever = new MetadataRetriever();
  const candidates = await retriever.retrieveCandidates({
    brief: '', brandName: '', aesthetic: '', textLength: 0, slideIndex: 0, totalSlides: 1,
  } as any);
  for (const id of NEW_FAMILY_IDS) {
    const found = candidates.find((c) => c.id === id && c.type === 'procedural');
    console.log(`[${found ? 'OK' : 'FAIL'}] retriever candidate '${id}' present`);
    if (!found) failures++;
  }
}

(async () => {
  await checkRetriever();

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED — Magazine family (Phase 2) is wired correctly.');
  } else {
    console.log(`${failures} CHECK(S) FAILED.`);
    process.exit(1);
  }
})();
