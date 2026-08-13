import { VIDEO_PLAN_FIXTURE_BRAND_DNA_ID } from '../contract/fixture';
import type { LlmPort } from './llm-port';
import { createAgentBudget } from './runtime';
import { runScriptAgent } from './script.agent';

const draft = {
  hook: 'Skin that feels like you',
  scenes: [
    { index: 0, headline: 'Skin that feels like you', caption: 'Quiet luxury, no rush', position: 'BOTTOM' },
    { index: 1, headline: 'Book a consult', caption: null, position: 'BOTTOM' },
  ],
  voiceoverScript: null,
};

describe('runScriptAgent', () => {
  it('returns a schema-valid script draft from submit_script', async () => {
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        expect(req.system).toContain('submit_script');
        expect(req.tools.some((tool) => tool.name === 'submit_script')).toBe(true);
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 40, outputTokens: 80 },
          content: [{ type: 'tool_use', id: 's1', name: 'submit_script', input: draft }],
        };
      },
    };

    const result = await runScriptAgent(
      {
        sceneCount: 2,
        objective: 'EDUCATE_TRUST',
        brandVoice: `brand ${VIDEO_PLAN_FIXTURE_BRAND_DNA_ID}`,
        medicalAesthetics: true,
      },
      llm,
      createAgentBudget(),
    );

    expect(result.output.hook).toBe(draft.hook);
    expect(result.output.scenes).toHaveLength(2);
    expect(result.output.voiceoverScript).toBeNull();
  });
});
