import { makeValidVideoPlan } from '../contract/fixture';
import { criticScore } from './critic.schema';
import { runCriticAgent } from './critic.agent';
import type { LlmPort } from './llm-port';
import { createAgentBudget } from './runtime';

const passing = {
  hook: 20,
  clarity: 16,
  brandVoice: 12,
  pacing: 8,
  objectiveFit: 12,
  compliance: 12,
  notes: ['Hook is specific and calm.'],
};

describe('runCriticAgent', () => {
  it('sums the rubric and passes at the threshold', async () => {
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        expect(req.tools.some((tool) => tool.name === 'submit_critique')).toBe(true);
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 20, outputTokens: 40 },
          content: [{ type: 'tool_use', id: 'c1', name: 'submit_critique', input: passing }],
        };
      },
    };

    const result = await runCriticAgent(
      { plan: makeValidVideoPlan({ videoType: 'SLIDESHOW' }) },
      llm,
      createAgentBudget(),
    );
    expect(result.score).toBe(criticScore(passing));
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.passed).toBe(true);
  });

  it('fails a weak draft below the pass score', async () => {
    const weak = {
      hook: 6,
      clarity: 6,
      brandVoice: 6,
      pacing: 4,
      objectiveFit: 6,
      compliance: 8,
      notes: ['Hook is generic. Rewrite scene 0.'],
    };
    const llm: LlmPort = {
      messagesCreate: async () => ({
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 20 },
        content: [{ type: 'tool_use', id: 'c1', name: 'submit_critique', input: weak }],
      }),
    };

    const result = await runCriticAgent(
      { plan: makeValidVideoPlan() },
      llm,
      createAgentBudget(),
    );
    expect(result.passed).toBe(false);
    expect(result.notes[0]).toContain('generic');
  });
});
