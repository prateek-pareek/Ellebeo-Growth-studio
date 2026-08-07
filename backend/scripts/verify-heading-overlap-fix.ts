import { CompositionOptimizer } from '../src/ai/services/template-engine/engines/composition-optimizer';
import { LayoutEngine } from '../src/ai/services/template-engine/engines/layout-engine';
import { ICompiledLayoutDSL, IDSLTextLayer, IDSLImageLayer } from '../src/ai/services/template-engine/interfaces';

const optimizer = new CompositionOptimizer();
const layoutEngine = new LayoutEngine(1080, 1920);
const constraints = layoutEngine.calculateConstraints('editorial', 'balanced', false, { heroBaseFontSize: 100, metadataBaseFontSize: 24, bodyBaseFontSize: 32 } as any);

let pass = 0, fail = 0;
function check(label: string, condition: boolean) {
  if (condition) { pass++; console.log(`[OK] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
}

function fakeDsl(): ICompiledLayoutDSL {
  const dsl: any = {
    schemaVersion: '1.0', layoutVersion: '1.0', id: 'fake_overlap_test',
    layers: [
      { id: 'img', type: 'image', zIndex: 10, mask: 'full_bleed', paddingPercent: 0, anchor: 'center' } as IDSLImageLayer,
      { id: 'headline', type: 'text', zIndex: 30, anchor: 'middle_left', role: 'heading', alignment: 'left', maxWidthPercent: 90 } as IDSLTextLayer,
      { id: 'tagline', type: 'text', zIndex: 31, anchor: 'middle_left', role: 'tagline', alignment: 'left', maxWidthPercent: 90 } as IDSLTextLayer,
    ],
  };
  // heroBaseFontSize=100 attached the same way DesignCompiler attaches it in production
  dsl.behavior = { heroBaseFontSize: 100, metadataBaseFontSize: 24, bodyBaseFontSize: 32 };
  return dsl;
}

const longHeadline = 'RESTORING LIPID INTEGRITY FOR EVERY STRAND';
const subheadline = 'EPIDERMAL HYDRATION RELIES ON LIPID INTEGRITY, NOT SURFACE OILS ALONE';

// ── 1. No copy passed (e.g. universal_dynamic_base's call site): unchanged flat estimate ──
const noCopyResult = optimizer.optimize(fakeDsl(), constraints, 1080, 1920, undefined, undefined, undefined);
const noCopyHeading = noCopyResult.layers.find(l => l.id === 'headline') as IDSLTextLayer;
check('no-copy call site keeps the old flat 300px heading estimate (zero behavior change)', (noCopyHeading.allocatedBox as any).height === 300);

// ── 2. Long headline text at a large font size: real estimate grows past the flat 300 default ──
const withCopyResult = optimizer.optimize(fakeDsl(), constraints, 1080, 1920, undefined, undefined, { headline: longHeadline, subheadline });
const heading = withCopyResult.layers.find(l => l.id === 'headline') as IDSLTextLayer;
const tagline = withCopyResult.layers.find(l => l.id === 'tagline') as IDSLTextLayer;
const headingBox = heading.allocatedBox as any;
const taglineBox = tagline.allocatedBox as any;

check('long headline at hero font size now estimates a taller box than the old flat 300px guess', headingBox.height > 300);
check('tagline is stacked using the REAL (taller) heading height, not the flat guess', taglineBox.y === headingBox.y + headingBox.height + 20);
check('tagline box no longer sits inside the headline box (no overlap by construction)', taglineBox.y >= headingBox.y + headingBox.height);

// ── 3. Short headline: real estimate should be smaller/comparable, not artificially inflated ──
const shortCopyResult = optimizer.optimize(fakeDsl(), constraints, 1080, 1920, undefined, undefined, { headline: 'GLOW', subheadline: 'Simple.' });
const shortHeading = shortCopyResult.layers.find(l => l.id === 'headline') as IDSLTextLayer;
check('a short headline gets a much smaller estimate than the long one (content-aware, not a fixed number)', (shortHeading.allocatedBox as any).height < headingBox.height);

console.log(`\nLong headline estimated height: ${headingBox.height}px (old flat guess was always 300px)`);
console.log(`Short headline estimated height: ${(shortHeading.allocatedBox as any).height}px`);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
