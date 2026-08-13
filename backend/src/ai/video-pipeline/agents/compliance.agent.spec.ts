import { makeValidVideoPlan } from '../contract/fixture';
import { runComplianceAgent } from './compliance.agent';
import type { LlmPort } from './llm-port';
import { createAgentBudget } from './runtime';

describe('runComplianceAgent', () => {
  it('returns an edge-case block from submit_compliance', async () => {
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        expect(req.tools.some((tool) => tool.name === 'submit_compliance')).toBe(true);
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 20 },
          content: [{
            type: 'tool_use',
            id: 'c1',
            name: 'submit_compliance',
            input: { block: true, notes: ['Implies wrinkle removal without saying it.'] },
          }],
        };
      },
    };

    const verdict = await runComplianceAgent(makeValidVideoPlan(), llm, createAgentBudget());
    expect(verdict.block).toBe(true);
    expect(verdict.notes[0]).toContain('wrinkle');
  });
});
