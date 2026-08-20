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

  it('in revision mode, prompts the model to rewrite only the flagged scenes and passes the critic notes through', async () => {
    const client = makeClient({ scenes: [{ index: 1, headline: 'Book Now', caption: null }] });

    await runScriptAgent({
      sceneCount: 2,
      objective: 'fill_quiet_days',
      brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
      medicalAesthetics: false,
      client,
      revision: {
        indices: [1],
        notes: ['Scene 1 hook is generic'],
        previousScenes: [{ index: 0, headline: 'Glow Up', caption: null }, { index: 1, headline: 'Old headline', caption: null }],
      },
    });

    const userPrompt = client.beta.tools.messages.create.mock.calls[0][0].messages[0].content;
    expect(userPrompt).toContain('Scenes to rewrite: 1');
    expect(userPrompt).toContain('Scene 1 hook is generic');
    expect(userPrompt).not.toContain('Number of scenes: 2');
  });
});
