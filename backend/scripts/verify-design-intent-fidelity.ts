import 'dotenv/config';
import { ArtDirectionEngine } from '../src/ai/services/template-engine/engines/art-direction-engine';
import { GeometryCompiler } from '../src/ai/services/template-engine/engines/geometry-compiler';
import { DesignCompiler } from '../src/ai/services/template-engine/engines/design-compiler';
import { TemplateAgentService } from '../src/ai/services/template-agent.service';
import { ISemanticDesignSpec, ICompiledLayoutDSL, IDSLTextLayer, IDSLImageLayer } from '../src/ai/services/template-engine/interfaces';
import { DECORATIONS, COMPILED_LAYOUTS, DecoCtx } from '../src/ai/config/layout-renderers';

const artDirectionEngine = new ArtDirectionEngine();
const geometryCompiler = new GeometryCompiler();
const designCompiler = new DesignCompiler();
const agent = new TemplateAgentService() as any;

let pass = 0, fail = 0;
function check(label: string, condition: boolean) {
  if (condition) { pass++; console.log(`[OK] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
}

function baseSpec(overrides: Partial<ISemanticDesignSpec> = {}): ISemanticDesignSpec {
  return {
    composition: { hero: 'image', balance: 'asymmetrical', negativeSpace: 'medium', ...overrides.composition },
    photo: { role: 'hero', treatment: 'framed', ...overrides.photo },
    typography: { hierarchy: 'editorial', dominance: 'medium', ...overrides.typography },
    decorations: { density: 'medium', ...overrides.decorations },
    style: { mood: 'warm_paper', ...overrides.style },
    hierarchy: overrides.hierarchy,
    spacing: overrides.spacing,
    emphasis: overrides.emphasis,
    philosophy: overrides.philosophy,
    groundedIn: overrides.groundedIn,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. End-to-end grounding: Template Agent's own grounding feeds ArtDirectionEngine
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- 1. Grounded selection (procedural family: transformation_timeline) ---');
const proceduralGrounding = agent.groundCandidate({ id: 'transformation_timeline', type: 'procedural' });
const groundedSpecA = agent.groundDesignSpec(
  { composition: { hero: 'image', balance: 'symmetrical', negativeSpace: 'medium', readingFlow: 'circular' } }, // deliberately wrong balance/readingFlow
  proceduralGrounding,
);

const legacyIntent = artDirectionEngine.generateDesignIntent('transformation_timeline', undefined, undefined);
const groundedIntent = artDirectionEngine.generateDesignIntent('transformation_timeline', undefined, undefined, groundedSpecA);

check('legacy (no designSpec) path unaffected — still matches hand-authored family DNA', legacyIntent.energy === 'calm' && legacyIntent.balance === 'asymmetrical' && legacyIntent.readingFlow === 'center_down');
check('grounded path overrides the wrong LLM balance with real mined data', groundedIntent.balance === 'asymmetrical');
check('grounded path overrides the wrong LLM readingFlow with real mined data', groundedIntent.readingFlow === 'center_down');
check('grounded and legacy paths agree on structural facts (both sourced from the same real data)', groundedIntent.balance === legacyIntent.balance && groundedIntent.readingFlow === legacyIntent.readingFlow);

// ═══════════════════════════════════════════════════════════════════════════
// 2. Creative differentiation: the OLD system could never react to per-generation
// creative intent (whitespace/mood/visualPriority came purely from id string).
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- 2. Creative differentiation (same id, different creative intent) ---');
const punchySpec = agent.groundDesignSpec(
  { composition: { hero: 'headline', balance: 'symmetrical', negativeSpace: 'minimal' }, spacing: { whitespaceFeel: 'tight', rhythm: 'compact' }, style: { mood: 'vibrant_pop' }, emphasis: { focalPoint: 'headline', contrastStrategy: 'high_impact' } },
  proceduralGrounding,
);
const luxurySpec = agent.groundDesignSpec(
  { composition: { hero: 'image', balance: 'symmetrical', negativeSpace: 'massive' }, spacing: { whitespaceFeel: 'luxury', rhythm: 'relaxed' }, style: { mood: 'luxury_black' }, emphasis: { focalPoint: 'image', contrastStrategy: 'soft_minimal' } },
  proceduralGrounding,
);
const punchyIntent = artDirectionEngine.generateDesignIntent('transformation_timeline', undefined, undefined, punchySpec);
const luxuryIntent = artDirectionEngine.generateDesignIntent('transformation_timeline', undefined, undefined, luxurySpec);

check('same id, different creative intent -> different whitespace', punchyIntent.whitespace !== luxuryIntent.whitespace);
check('same id, different creative intent -> different mood', punchyIntent.mood !== luxuryIntent.mood);
check('same id, different creative intent -> different visualPriority', punchyIntent.visualPriority !== luxuryIntent.visualPriority);
check('legacy path is blind to this (always identical regardless of content)', legacyIntent.whitespace === artDirectionEngine.generateDesignIntent('transformation_timeline', undefined, undefined).whitespace);

// ═══════════════════════════════════════════════════════════════════════════
// 3. GeometryCompiler: graded enum coverage (previously only extremes did anything)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- 3. GeometryCompiler graded negativeSpace / dominance / alignment ---');
const behavior = artDirectionEngine.mapIntentToBehavior(groundedIntent);
const designLanguage = { intent: groundedIntent, behavior };

const safeXByNegSpace = ['minimal', 'medium', 'large', 'massive'].map(ns =>
  geometryCompiler.compile(designLanguage, 1080, 1920, baseSpec({ composition: { hero: 'image', balance: 'asymmetrical', negativeSpace: ns as any } })).safeX
);
check('negativeSpace is monotonically graded across all 4 values (minimal < medium < large < massive)', safeXByNegSpace[0] < safeXByNegSpace[1] && safeXByNegSpace[1] < safeXByNegSpace[2] && safeXByNegSpace[2] < safeXByNegSpace[3]);

const heroSizeByDominance = ['low', 'medium', 'high'].map(d =>
  geometryCompiler.compile(designLanguage, 1080, 1920, baseSpec({ typography: { hierarchy: 'editorial', dominance: d as any } })).typography.heroSize
);
check('dominance "medium" is no longer a no-op (low < medium < high)', heroSizeByDominance[0] < heroSizeByDominance[1] && heroSizeByDominance[1] < heroSizeByDominance[2]);

const alignmentOverride = geometryCompiler.compile(designLanguage, 1080, 1920, baseSpec({ typography: { hierarchy: 'editorial', dominance: 'medium', alignment: 'right' } })).alignment;
check('explicit typography.alignment overrides the readingFlow-derived default', alignmentOverride === 'right');

// ═══════════════════════════════════════════════════════════════════════════
// 4. DesignCompiler: technical hierarchy + headlineTreatment independent of hierarchy
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- 4. DesignCompiler dead-field fixes ---');
function fakeDsl(): ICompiledLayoutDSL {
  return {
    schemaVersion: '1.0', layoutVersion: '1.0', id: 'fake_test_dsl',
    layers: [
      { id: 'img', type: 'image', zIndex: 10, mask: 'rectangle', paddingPercent: 8, anchor: 'center' } as IDSLImageLayer,
      { id: 'head', type: 'text', zIndex: 30, anchor: 'bottom_center', role: 'heading', alignment: 'center', maxWidthPercent: 80 } as IDSLTextLayer,
    ],
  };
}

const technicalResult = designCompiler.compile(fakeDsl(), baseSpec({ typography: { hierarchy: 'technical', dominance: 'medium' }, composition: { hero: 'image', balance: 'asymmetrical', negativeSpace: 'medium' } }));
const technicalHeading = technicalResult.layers.find(l => l.id === 'head') as IDSLTextLayer;
check('"technical" hierarchy now gets the asymmetrical left-align sync (previously only "editorial" did)', technicalHeading.alignment === 'left' && technicalHeading.anchor === 'bottom_left');

const experimentalWithBold = designCompiler.compile(fakeDsl(), baseSpec({ typography: { hierarchy: 'bold', dominance: 'medium', headlineTreatment: 'experimental' } }));
const experimentalHeading = experimentalWithBold.layers.find(l => l.id === 'head') as IDSLTextLayer;
check('headlineTreatment="experimental" now fires for non-editorial hierarchies too', experimentalHeading.rotation === -90);

const explicitAlignment = designCompiler.compile(fakeDsl(), baseSpec({ typography: { hierarchy: 'minimal', dominance: 'medium', alignment: 'right' } }));
const explicitHeading = explicitAlignment.layers.find(l => l.id === 'head') as IDSLTextLayer;
check('explicit typography.alignment wins even for hierarchies with no built-in alignment logic', explicitHeading.alignment === 'right');

const gradedNegSpace = ['minimal', 'medium', 'large', 'massive'].map(ns =>
  (designCompiler.compile(fakeDsl(), baseSpec({ composition: { hero: 'image', balance: 'asymmetrical', negativeSpace: ns as any } })).layers.find(l => l.id === 'head') as IDSLTextLayer).maxWidthPercent
);
check('DesignCompiler negativeSpace maxWidthPercent is graded across all 4 values', gradedNegSpace[0] === 85 && gradedNegSpace[1] === 75 && gradedNegSpace[2] === 65 && gradedNegSpace[3] === 50);

// ═══════════════════════════════════════════════════════════════════════════
// 5. layout-renderers.ts: no more duplicate re-derivation + decorations.density gating
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- 5. universal_dynamic_deco: designLanguage threading + density gating ---');
const realRigidId = 'layout_v2_editorial_z_pattern_1';
check('sanity: real rigid id exists in COMPILED_LAYOUTS', !!COMPILED_LAYOUTS[realRigidId]);

function fakeDecoCtx(designSpecOverride: ISemanticDesignSpec): DecoCtx {
  const intent = artDirectionEngine.generateDesignIntent(realRigidId, undefined, undefined, designSpecOverride);
  check('grounded rigid id resolves the real family ("editorial"), not a "layout_v2" string fragment', intent.family === 'editorial');
  const behaviorProfile = artDirectionEngine.mapIntentToBehavior(intent);
  return {
    layoutType: realRigidId, w: 1080, h: 1920,
    paddingX: 60, paddingTop: 80, paddingBottom: 160, innerW: 960, innerH: 1680,
    validBrandColor: '#1E1E1C', validSecondaryColor: '#D4A373', validBackgroundColor: '#F7F4EF',
    validAccentColor: '#D4A373', validDepthColor: '#1E1E1C', brandFont: 'Inter', rawName: 'test',
    photoDataUri: '', escapedLines: ['Test Headline'], dyOffset: 0, dynamicFontSize: 90,
    dynamicTextColor: '#1E1E1C', overlayText: 'Test Headline', maxLength: 100,
    structuredText: { headline: 'Test Headline', subheadline: 'Test sub', cta: 'Learn more' },
    designSpec: designSpecOverride,
    designLanguage: { intent, behavior: behaviorProfile },
    activeTheme: 'editorial_beauty',
  } as DecoCtx;
}

let svgHighDensity = '';
let svgNoneDensity = '';
let threw = false;
try {
  svgHighDensity = DECORATIONS.universal_dynamic_deco(fakeDecoCtx(baseSpec({ decorations: { density: 'high' }, style: { mood: 'warm_paper' } })));
  svgNoneDensity = DECORATIONS.universal_dynamic_deco(fakeDecoCtx(baseSpec({ decorations: { density: 'none' }, style: { mood: 'warm_paper' } })));
} catch (e) {
  threw = true;
  console.error(e);
}
check('universal_dynamic_deco runs end-to-end with a grounded designSpec without throwing', !threw);
check('decorations.density="high" + organic mood includes the mood texture overlay', svgHighDensity.includes('Paper Texture'));
check('decorations.density="none" excludes the same mood texture overlay (previously always included)', !svgNoneDensity.includes('Paper Texture'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
