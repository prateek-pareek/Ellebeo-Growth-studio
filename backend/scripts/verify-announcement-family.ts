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

// Throwaway verification for Phase 5 (Announcement family, final phase):
// runs each of the 2 new recipes through the exact engine chain
// ai-image-generation.service.ts uses, confirms the new
// announcement_banner_ribbon primitive renders real SVG, and confirms the
// reused starburst_badge primitive (added to the component union for the
// first time this phase, previously registered but never referenced) works.

const NEW_FAMILY_IDS = ['announcement_banner', 'announcement_spotlight'];

const compositionEngine = new CompositionEngine();
const artDirectionEngine = new ArtDirectionEngine();
const themeEngine = new ThemeEngine();
const geometryCompiler = new GeometryCompiler();
const designCompiler = new DesignCompiler();
const compositionOptimizer = new CompositionOptimizer();
const typographyEngine = new TypographyEngine();
const primitiveEngineForLayers = new PrimitiveEngine();

const SAMPLE_TEXT: Record<string, string> = {
  heading: 'We Are Now Open Saturdays',
  tagline: 'Book your weekend slot today',
};

const CANVAS_W = 1080;
const CANVAS_H = 1080;

let failures = 0;

for (const id of NEW_FAMILY_IDS) {
  try {
    const dsl = compositionEngine.buildRecipe(id, 0, 'Test Brand');
    if (!dsl.layers || dsl.layers.length === 0) throw new Error('No layers produced');

    const intent = artDirectionEngine.generateDesignIntent(id);
    if (intent.family !== 'announcement') {
      throw new Error(`Expected family 'announcement', got '${intent.family}'`);
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
    };
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

// ── New primitive renders real SVG ──
{
  const primitiveEngine = new PrimitiveEngine();
  const primitiveCtx: PrimitiveContext = {
    w: 1080, h: 1080,
    validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
    constraints: { safeX: 60, safeY: 80 },
  };
  const svg = primitiveEngine.renderPrimitive('announcement_banner_ribbon', primitiveCtx, { anchor: 'top_center' } as any);
  const ok = svg.length > 0 && !svg.includes('MISSING COMPONENT');
  console.log(`[${ok ? 'OK' : 'FAIL'}] primitive 'announcement_banner_ribbon' -> ${svg.length} chars`);
  if (!ok) failures++;

  const svgStarburst = primitiveEngine.renderPrimitive('starburst_badge', primitiveCtx, { anchor: 'center' } as any);
  const okStarburst = svgStarburst.length > 0 && !svgStarburst.includes('MISSING COMPONENT');
  console.log(`[${okStarburst ? 'OK' : 'FAIL'}] primitive 'starburst_badge' (pre-existing, newly referenced) -> ${svgStarburst.length} chars`);
  if (!okStarburst) failures++;
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

  // Full sweep: all 15 new recipe ids across all 5 phases must still be present together.
  const ALL_NEW_IDS = [
    'transformation_timeline', 'transformation_journey_arc', 'transformation_stat_reveal',
    'magazine_masthead_cover', 'magazine_pull_quote_spread', 'magazine_contents_grid',
    'polaroid_wall', 'polaroid_stacked_caption',
    'notification_card_alert', 'notification_card_banner',
    'announcement_banner', 'announcement_spotlight',
  ];
  const allFound = ALL_NEW_IDS.every((id) => candidates.some((c) => c.id === id && c.type === 'procedural'));
  console.log(`[${allFound ? 'OK' : 'FAIL'}] all 12 new recipe ids across all 5 phases present in retriever candidate pool`);
  if (!allFound) failures++;
}

(async () => {
  await checkRetriever();

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED — Announcement family (Phase 5) is wired correctly. All 5 phases complete.');
  } else {
    console.log(`${failures} CHECK(S) FAILED.`);
    process.exit(1);
  }
})();
