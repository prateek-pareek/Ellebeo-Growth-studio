import compiledLayoutsData from '../src/ai/config/compiled-layouts.v2.json';
import knowledgeMapData from '../src/ai/config/design-knowledge-map.json';
import { ArtDirectionEngine } from '../src/ai/services/template-engine/engines/art-direction-engine';
import { ThemeEngine } from '../src/ai/services/template-engine/engines/theme-engine';
import { GeometryCompiler } from '../src/ai/services/template-engine/engines/geometry-compiler';
import { DesignCompiler } from '../src/ai/services/template-engine/engines/design-compiler';
import { LayoutEngine } from '../src/ai/services/template-engine/engines/layout-engine';
import { CompositionOptimizer } from '../src/ai/services/template-engine/engines/composition-optimizer';
import { PrimitiveEngine, PrimitiveContext } from '../src/ai/services/template-engine/engines/primitive-engine';
import { TypographyEngine, TypographyContext } from '../src/ai/services/template-engine/engines/typography-engine';

// Verifies the round-2 (gemini-2.5-flash, 1040 templates) additions to compiled-layouts.v2.json
// actually render end to end through the REAL runtime chain — the same one rigid ids go through
// at generation time (metadata.retriever.ts -> COMPILED_LAYOUTS[id] lookup -> designCompiler.compile
// -> layoutEngine -> compositionOptimizer -> typographyEngine/primitiveEngine per layer). Focused on
// the 4 families that had NO compileFamily() branch before this batch (transformation, polaroid,
// notification_card, announcement) since those are the highest-risk new code paths — plus a spot
// check across every other family to confirm broad coverage, not just these 4.

const compiledLayouts: Record<string, any> = compiledLayoutsData as any;
const knowledgeMap: Record<string, any> = knowledgeMapData as any;

const artDirectionEngine = new ArtDirectionEngine();
const themeEngine = new ThemeEngine();
const geometryCompiler = new GeometryCompiler();
const designCompiler = new DesignCompiler();
const compositionOptimizer = new CompositionOptimizer();
const typographyEngine = new TypographyEngine();
const primitiveEngine = new PrimitiveEngine();

const SAMPLE_TEXT: Record<string, string> = {
  heading: 'Radiant Results, Redefined',
  tagline: 'Book your consultation today',
  body: 'A gentle, personalised treatment designed around your skin.',
};

const CANVAS_W = 1080;
const CANVAS_H = 1080;

function pickSample(family: string, count: number): string[] {
  return Object.keys(knowledgeMap)
    .filter((id) => id.includes('batch3_') && knowledgeMap[id]?.layoutFamily?.value === family && compiledLayouts[id])
    .slice(0, count);
}

const TARGET_IDS = [
  ...pickSample('transformation', 3),
  ...pickSample('polaroid', 3),
  ...pickSample('notification_card', 3),
  ...pickSample('announcement', 3),
  ...pickSample('countdown_promo', 1),
  ...pickSample('product_showcase', 1),
  ...pickSample('minimalist_quote', 1),
  ...pickSample('before_after', 1),
  ...pickSample('clinical_hero', 1),
  ...pickSample('text_only', 1),
  ...pickSample('editorial', 1),
  ...pickSample('split', 1),
  ...pickSample('quadrant', 1),
  ...pickSample('testimonial', 1),
  ...pickSample('scrapbook', 1),
];

console.log(`Testing ${TARGET_IDS.length} round-2 rigid ids across all families with real coverage.\n`);

let failures = 0;
let passed = 0;

for (const id of TARGET_IDS) {
  try {
    const dsl = compiledLayouts[id];
    if (!dsl) throw new Error('DSL not found in compiled-layouts.v2.json');

    const family = knowledgeMap[id]?.layoutFamily?.value;
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
    if (!optimized.layers || optimized.layers.length === 0) throw new Error('No layers after optimize');

    const primitiveCtx: PrimitiveContext = {
      w: CANVAS_W, h: CANVAS_H,
      validBrandColor: '#1a1a1a', validSecondaryColor: '#f5f0eb', validBackgroundColor: '#ffffff',
      validAccentColor: '#d4a373',
      constraints: constraints as any,
      behavior,
      layoutState: { occupiedRegions: [] },
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
        } as any;
        const svg = typographyEngine.renderTextLayer(typographyCtx, layer as any);
        if (!svg || svg.length === 0) throw new Error(`Empty typography output for '${layer.id}'`);
      } else if (layer.type === 'decoration') {
        const componentName = (layer as any).component;
        const svg = primitiveEngine.renderPrimitive(componentName, primitiveCtx, layer as any);
        if (!svg || svg.includes('MISSING COMPONENT')) throw new Error(`Primitive '${componentName}' failed for '${layer.id}'`);
      }
    }

    console.log(`[OK] ${id} (${family}) -> ${optimized.layers.length} layers rendered`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${id}:`, err?.message || err);
    failures++;
  }
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exitCode = 1;
