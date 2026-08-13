import { z } from 'zod';
import type { LlmPort, LlmResponse } from './llm-port';
import {
  AgentBudgetError,
  AgentRuntimeError,
  createAgentBudget,
  runAgent,
  type AgentDefinition,
} from './runtime';

const outputSchema = z.object({
  hook: z.string(),
  n: z.number().int(),
});

const definition: AgentDefinition<z.infer<typeof outputSchema>> = {
  name: 'test-agent',
  systemPrompt: 'test',
  terminalToolName: 'submit_output',
  outputSchema,
  tools: [
    {
      name: 'submit_output',
      description: 'Submit',
      inputSchema: { type: 'object', properties: { hook: { type: 'string' }, n: { type: 'integer' } } },
      terminal: true,
    },
    {
      name: 'ping',
      description: 'Ping',
      inputSchema: { type: 'object', properties: {} },
      execute: () => ({ ok: true }),
    },
  ],
};

function llmFrom(responses: LlmResponse[]): LlmPort {
  let i = 0;
  return {
    messagesCreate: async () => {
      const next = responses[i];
      i += 1;
      if (!next) throw new Error('unexpected LLM call');
      return next;
    },
  };
}

const usage = { inputTokens: 10, outputTokens: 20 };

describe('runAgent', () => {
  it('accepts a terminal tool_use payload', async () => {
    const llm = llmFrom([
      {
        stopReason: 'tool_use',
        usage,
        content: [
          {
            type: 'tool_use',
            id: '1',
            name: 'submit_output',
            input: { hook: 'Glow', n: 2 },
          },
        ],
      },
    ]);

    const result = await runAgent({
      definition,
      userPrompt: 'go',
      llm,
      budget: createAgentBudget(),
    });
    expect(result.output).toEqual({ hook: 'Glow', n: 2 });
    expect(result.repaired).toBe(false);
    expect(result.toolCalls).toBe(1);
  });

  it('repairs malformed JSON text when the model skips tools', async () => {
    const llm = llmFrom([
      {
        stopReason: 'end_turn',
        usage,
        content: [
          {
            type: 'text',
            text: '```json\n{"hook":"Soft glam", "n": 2,}\n```',
          },
        ],
      },
    ]);

    const result = await runAgent({
      definition,
      userPrompt: 'go',
      llm,
      budget: createAgentBudget(),
    });
    expect(result.output).toEqual({ hook: 'Soft glam', n: 2 });
    expect(result.repaired).toBe(true);
  });

  it('fails when malformed output cannot be repaired', async () => {
    const llm = llmFrom([
      {
        stopReason: 'end_turn',
        usage,
        content: [{ type: 'text', text: 'I refuse to output JSON' }],
      },
    ]);

    await expect(
      runAgent({ definition, userPrompt: 'go', llm, budget: createAgentBudget() }),
    ).rejects.toThrow(AgentRuntimeError);
  });

  it('stops when max tool calls is exceeded', async () => {
    const llm: LlmPort = {
      messagesCreate: async () => ({
        stopReason: 'tool_use',
        usage,
        content: [{ type: 'tool_use', id: 'ping', name: 'ping', input: {} }],
      }),
    };

    await expect(
      runAgent({
        definition,
        userPrompt: 'go',
        llm,
        budget: createAgentBudget({ maxToolCalls: 2 }),
      }),
    ).rejects.toThrow(AgentBudgetError);
  });

  it('stops before a call when the cost ceiling is already hit', async () => {
    const llm: LlmPort = {
      messagesCreate: async () => {
        throw new Error('should not call LLM');
      },
    };

    await expect(
      runAgent({
        definition,
        userPrompt: 'go',
        llm,
        budget: createAgentBudget({ costUsd: 1, maxCostUsd: 0.25 }),
      }),
    ).rejects.toThrow(AgentBudgetError);
  });
});
