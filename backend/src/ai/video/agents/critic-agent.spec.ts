import { runCriticAgent } from './critic-agent';

function makeClient(input: unknown) {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'tool_1', name: 'submit_critique', input }],
    usage: { input_tokens: 50, output_tokens: 50 },
  });
  return { beta: { tools: { messages: { create } } } } as any;
}

const baseParams = {
  scenes: [{ index: 0, headline: 'Glow Up', caption: null }],
  objective: 'fill_quiet_days',
  brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
  medicalAesthetics: false,
};

describe('runCriticAgent', () => {
  it('marks passed=true when the score is at or above the threshold', async () => {
    const client = makeClient({ score: 0.85, weakSceneIndices: [], notes: ['Strong hook, on-brand.'] });
    const result = await runCriticAgent({ ...baseParams, client });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.85);
  });

  it('marks passed=false when the score is below the threshold, regardless of what the model implies', async () => {
    const client = makeClient({ score: 0.4, weakSceneIndices: [0], notes: ['Hook is generic and forgettable.'] });
    const result = await runCriticAgent({ ...baseParams, client });
    expect(result.passed).toBe(false);
    expect(result.weakSceneIndices).toEqual([0]);
  });

  it('the pass/fail decision is deterministic from the score, not trusted from model prose', async () => {
    // Even a score exactly at the threshold boundary should be handled consistently.
    const client = makeClient({ score: 0.7, weakSceneIndices: [], notes: ['Borderline but acceptable.'] });
    const result = await runCriticAgent({ ...baseParams, client });
    expect(result.passed).toBe(true);
  });
});
