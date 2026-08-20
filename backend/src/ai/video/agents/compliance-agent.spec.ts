import { runComplianceAgent } from './compliance-agent';

function makeClient(input: unknown) {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'tool_1', name: 'submit_compliance_review', input }],
    usage: { input_tokens: 40, output_tokens: 40 },
  });
  return { beta: { tools: { messages: { create } } } } as any;
}

const baseParams = {
  scenes: [{ index: 0, headline: "You'll notice a difference", caption: null }],
  brandVoice: { businessName: 'Glow Clinic', primaryTone: 'clinical', vocabularyBlacklist: [], doNotSay: [] },
};

describe('runComplianceAgent', () => {
  it('flags a scene with subtly implied outcome language', async () => {
    const client = makeClient({ flaggedSceneIndices: [0], reasons: ['Implies a treatment outcome without explicit claim words'] });
    const result = await runComplianceAgent({ ...baseParams, client });
    expect(result.output.flaggedSceneIndices).toEqual([0]);
    expect(result.output.reasons).toHaveLength(1);
  });

  it('returns an empty flag list when copy is clean', async () => {
    const client = makeClient({ flaggedSceneIndices: [], reasons: [] });
    const result = await runComplianceAgent({ ...baseParams, client });
    expect(result.output.flaggedSceneIndices).toEqual([]);
  });
});
