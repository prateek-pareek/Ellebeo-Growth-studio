import { z } from 'zod';
import { runToolAgent, AgentBoundsExceededError, AgentOutputValidationError } from './tool-agent-runtime';

const OutputSchema = z.object({ headline: z.string(), count: z.number().int().nonnegative() });

function makeClient(...responses: any[]) {
  const create = jest.fn();
  responses.forEach((r) => create.mockResolvedValueOnce(r));
  return { beta: { tools: { messages: { create } } } } as any;
}

function textResponse(usage = { input_tokens: 10, output_tokens: 10 }) {
  return { content: [{ type: 'text', text: 'hello' }], usage };
}

function toolUseResponse(name: string, input: unknown, id = 'tool_1', usage = { input_tokens: 10, output_tokens: 10 }) {
  return { content: [{ type: 'tool_use', id, name, input }], usage };
}

const baseParams = {
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'system',
  userPrompt: 'user',
  outputToolName: 'submit_output',
  outputToolDescription: 'submit',
  outputJsonSchema: { type: 'object' as const, properties: {} },
  outputZodSchema: OutputSchema,
};

describe('runToolAgent', () => {
  it('returns validated output when the model calls the output tool correctly on the first try', async () => {
    const client = makeClient(toolUseResponse('submit_output', { headline: 'Hi', count: 1 }));
    const result = await runToolAgent({ ...baseParams, client });

    expect(result.output).toEqual({ headline: 'Hi', count: 1 });
    expect(result.repaired).toBe(false);
    expect(result.tokensUsed).toBe(20);
  });

  it('repairs a malformed first output by nudging the model and accepting a corrected second call', async () => {
    const client = makeClient(
      toolUseResponse('submit_output', { headline: 'Hi', count: 'not-a-number' }, 'tool_1'),
      toolUseResponse('submit_output', { headline: 'Hi', count: 2 }, 'tool_2'),
    );
    const result = await runToolAgent({ ...baseParams, client });

    expect(result.output).toEqual({ headline: 'Hi', count: 2 });
    expect(result.repaired).toBe(true);
    expect(client.beta.tools.messages.create).toHaveBeenCalledTimes(2);
  });

  it('throws AgentOutputValidationError if the output is still invalid after one repair attempt', async () => {
    const client = makeClient(
      toolUseResponse('submit_output', { headline: 'Hi', count: 'nope' }),
      toolUseResponse('submit_output', { headline: 'Hi', count: 'still-nope' }),
    );
    await expect(runToolAgent({ ...baseParams, client })).rejects.toThrow(AgentOutputValidationError);
  });

  it('nudges the model back to the output tool if it responds with plain text first', async () => {
    const client = makeClient(
      textResponse(),
      toolUseResponse('submit_output', { headline: 'Hi', count: 1 }),
    );
    const result = await runToolAgent({ ...baseParams, client });
    expect(result.output).toEqual({ headline: 'Hi', count: 1 });
    expect(result.repaired).toBe(true);
  });

  it('executes worker tools and feeds results back before the output tool is called', async () => {
    const client = makeClient(
      toolUseResponse('lookup', { query: 'x' }, 'tool_1'),
      toolUseResponse('submit_output', { headline: 'Hi', count: 1 }, 'tool_2'),
    );
    const execute = jest.fn().mockResolvedValue({ found: true });

    const result = await runToolAgent({
      ...baseParams,
      client,
      tools: [{ name: 'lookup', description: 'looks things up', inputSchema: { type: 'object' }, execute }],
    });

    expect(execute).toHaveBeenCalledWith({ query: 'x' });
    expect(result.output).toEqual({ headline: 'Hi', count: 1 });
    expect(result.toolCallCount).toBe(1);
  });

  it('throws AgentBoundsExceededError when worker tool calls exceed maxToolCalls', async () => {
    const client = makeClient(
      toolUseResponse('lookup', {}, 'tool_1'),
      toolUseResponse('lookup', {}, 'tool_2'),
    );
    const execute = jest.fn().mockResolvedValue({});

    await expect(
      runToolAgent({
        ...baseParams,
        client,
        maxToolCalls: 1,
        tools: [{ name: 'lookup', description: 'x', inputSchema: { type: 'object' }, execute }],
      }),
    ).rejects.toThrow(AgentBoundsExceededError);
  });

  it('throws AgentBoundsExceededError when the token budget is exceeded', async () => {
    const client = makeClient(toolUseResponse('submit_output', { headline: 'Hi', count: 1 }, 'tool_1', { input_tokens: 5000, output_tokens: 5000 }));
    await expect(runToolAgent({ ...baseParams, client, tokenBudget: 1000 })).rejects.toThrow(AgentBoundsExceededError);
  });
});
