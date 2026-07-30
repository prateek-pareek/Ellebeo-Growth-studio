import { PrimitiveEngine, PrimitiveContext } from '../src/ai/services/template-engine/engines/primitive-engine';
import { MetadataRetriever } from '../src/ai/services/template-engine/metadata.retriever';

// Throwaway verification for the deeper Editorial-parity integration:
// 1. Confirm the 3 new primitives actually render (not the "MISSING COMPONENT" fallback).
// 2. Confirm metadata.retriever.ts picks up the newly-compiled split/countdown_promo/product_showcase
//    entries from compiled-layouts.v2.json with correct classification.

const primitiveEngine = new PrimitiveEngine();
const ctx: PrimitiveContext = {
  w: 1080, h: 1080,
  validBrandColor: '#111111', validSecondaryColor: '#888888', validBackgroundColor: '#ffffff',
  constraints: { safeX: 60, safeY: 80 },
};

let failures = 0;
for (const name of ['split_seam_line', 'countdown_urgency_badge', 'product_halo_ring']) {
  const svg = primitiveEngine.renderPrimitive(name, ctx);
  const ok = svg.length > 0 && !svg.includes('MISSING COMPONENT');
  console.log(`[${ok ? 'OK' : 'FAIL'}] primitive '${name}' -> ${svg.length} chars`);
  if (!ok) failures++;
}

async function checkRetriever() {
  const retriever = new MetadataRetriever();
  const candidates = await retriever.retrieveCandidates({
    brief: '', brandName: '', aesthetic: '', textLength: 0, slideIndex: 0, totalSlides: 1,
  });

  for (const family of ['split', 'countdown_promo', 'product_showcase']) {
    const matches = candidates.filter((c) => c.id.includes(`layout_v2_${family}`));
    const sample = matches[0];
    console.log(`\n${family}: ${matches.length} compiled candidates found`);
    if (sample) {
      console.log(`  sample: ${sample.id} -> category="${sample.category}", macroFaceSafe=${sample.macroFaceSafe}`);
    } else {
      failures++;
      console.log(`  [FAIL] no candidates found for ${family}`);
    }
  }

  console.log(`\nTotal candidates from retriever (rigid + procedural): ${candidates.length}`);
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exit(1);
}

checkRetriever();
