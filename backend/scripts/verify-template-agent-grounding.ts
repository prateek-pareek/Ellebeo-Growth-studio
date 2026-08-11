import 'dotenv/config'; // must load before TemplateAgentService, whose import chain (layout-renderers.ts) instantiates an OpenAI client at module-load time
import { TemplateAgentService } from '../src/ai/services/template-agent.service';

// TemplateAgentService is a plain NestJS-decorated class with no injected deps in its
// constructor (it constructs its own engines internally), so it's safe to `new` directly
// in a script — same pattern as the other verify-*.ts scripts in this folder.
const agent = new TemplateAgentService() as any;

function check(label: string, condition: boolean) {
  console.log(`${condition ? '[OK]' : '[FAIL]'} ${label}`);
  if (!condition) process.exitCode = 1;
}

// ── 1. Rigid candidate with exact ground truth ──────────────────────────────
const rigidGrounding = agent.groundCandidate({ id: 'layout_v2_editorial_z_pattern_1', type: 'rigid' });
check('rigid exact grounding found', !!rigidGrounding && rigidGrounding.source === 'mined_exact');
check('rigid exact grounding has real balance/readingFlow', rigidGrounding?.balance === 'asymmetrical' && rigidGrounding?.readingFlow === 'z_pattern');

// ── 2. Procedural candidate falls back to family stats ──────────────────────
const proceduralGrounding = agent.groundCandidate({ id: 'transformation_timeline', type: 'procedural' });
check('procedural family grounding found', !!proceduralGrounding && proceduralGrounding.source === 'mined_family_stats');
check('procedural family grounding cites real sample fraction', /^\d+\/13$/.test(proceduralGrounding?.sampleFraction || ''));
check('procedural family grounding matches known transformation stats', proceduralGrounding?.energy === 'calm' && proceduralGrounding?.balance === 'asymmetrical');

// ── 3. groundDesignSpec overrides structural fields, preserves creative fields ──
const fakeLlmSpec = {
  composition: { hero: 'headline', balance: 'symmetrical', negativeSpace: 'large', readingFlow: 'circular' }, // deliberately WRONG balance/readingFlow
  photo: { role: 'supporting', treatment: 'die_cut' },
  typography: { hierarchy: 'bold', dominance: 'high', alignment: 'center' },
  decorations: { density: 'high' },
  style: { mood: 'vibrant_pop' },
  hierarchy: { primaryElement: 'headline', secondaryElement: 'image' },
  spacing: { whitespaceFeel: 'tight', rhythm: 'compact' },
  emphasis: { focalPoint: 'headline', contrastStrategy: 'high_impact' },
  philosophy: 'A punchy, headline-led moment to open the carousel.',
};

const grounded = agent.groundDesignSpec(fakeLlmSpec, rigidGrounding);
check('groundDesignSpec overrides balance from mined data', grounded.composition.balance === 'asymmetrical');
check('groundDesignSpec overrides readingFlow from mined data', grounded.composition.readingFlow === 'z_pattern');
check('groundDesignSpec preserves LLM creative field: hero', grounded.composition.hero === 'headline');
check('groundDesignSpec preserves LLM creative field: mood', grounded.style.mood === 'vibrant_pop');
check('groundDesignSpec preserves LLM creative field: philosophy', grounded.philosophy === fakeLlmSpec.philosophy);
check('groundDesignSpec preserves LLM creative field: hierarchy', grounded.hierarchy?.primaryElement === 'headline');
check('groundDesignSpec preserves LLM creative field: emphasis', grounded.emphasis?.contrastStrategy === 'high_impact');
check('groundDesignSpec sets groundedIn.source = mined_exact', grounded.groundedIn?.source === 'mined_exact');
check('groundDesignSpec sets groundedIn.energy from mined data', grounded.groundedIn?.energy === 'calm');

// ── 4. groundDesignSpec with no grounding available falls back to llm_inferred ──
const ungrounded = agent.groundDesignSpec(fakeLlmSpec, undefined);
check('groundDesignSpec with no grounding keeps LLM balance as-is', ungrounded.composition.balance === 'symmetrical');
check('groundDesignSpec with no grounding sets groundedIn.source = llm_inferred', ungrounded.groundedIn?.source === 'llm_inferred');

// ── 5. groundDesignSpec is defensive against a missing/malformed rawSpec ────
const defaulted = agent.groundDesignSpec(undefined, undefined);
check('groundDesignSpec handles missing rawSpec without throwing', defaulted.composition.hero === 'image' && defaulted.style.mood === 'warm_paper');

console.log('\nSample grounded spec:', JSON.stringify(grounded, null, 2));
