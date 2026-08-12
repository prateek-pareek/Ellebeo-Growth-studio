import { runScriptAgent } from './script-agent';

function makeClient(input: unknown) {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'tool_1', name: 'submit_scenes', input }],
    usage: { input_tokens: 50, output_tokens: 50 },
  });
  return { beta: { tools: { messages: { create } } } } as any;
}

describe('runScriptAgent', () => {
  it('returns validated scene copy from a well-formed tool_use response', async () => {
    const client = makeClient({
      scenes: [
        { index: 0, headline: 'Glow Up', caption: null },
        { index: 1, headline: 'Book Today', caption: 'Spots filling fast' },
      ],
    });

    const result = await runScriptAgent({
      sceneCount: 2,
      objective: 'fill_quiet_days',
      brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
      medicalAesthetics: false,
      client,
    });

    expect(result.output.scenes).toHaveLength(2);
    expect(result.output.scenes[0]!.headline).toBe('Glow Up');
  });

  it('rejects a response missing required scene fields (schema-invalid) after exhausting repair', async () => {
    const client = makeClient({ scenes: [{ index: 0 }] });
    await expect(
      runScriptAgent({
        sceneCount: 1,
        objective: 'fill_quiet_days',
        brandVoice: { businessName: 'Glow Studio', primaryTone: null, vocabularyBlacklist: [], doNotSay: [] },
        medicalAesthetics: false,
        client,
      }),
    ).rejects.toThrow();
  });
});
