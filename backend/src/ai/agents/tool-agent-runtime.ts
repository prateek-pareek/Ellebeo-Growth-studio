// ============================================================================
// tool-agent-runtime.ts — the agent runtime every video-pipeline agent builds
// on. Built from scratch: no raw Anthropic tool-use wrapper existed anywhere
// in this codebase (Phase 0 finding) — all existing chains do plain
// JSON-in-prompt + manual parsing via LangChain. This runtime forces
// structured output through Anthropic's tool-use ("beta.tools.messages" —
// the SDK pinned here, 0.20.0, predates tool-use graduating out of beta;
// same wire contract, upgrading the SDK is a separate concern) instead of
// hoping the model's prose parses as JSON.
//
// Contract every agent gets for free: scoped system prompt + tool set + a
// JSON output contract enforced by having the model call a dedicated
// "output tool" + zod validation + a bounded JSON-repair fallback + hard
// ceilings on tool calls and token spend.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export interface AgentToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
}

export interface RunToolAgentParams<T> {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  outputToolName: string;
  outputToolDescription: string;
  outputJsonSchema: Record<string, unknown>;
  outputZodSchema: z.ZodSchema<T>;
  tools?: AgentToolHandler[];
  maxTokens?: number;
  /** Worker-tool calls only — the mandatory output-tool call doesn't count against this. */
  maxToolCalls?: number;
  tokenBudget?: number;
  temperature?: number;
  /** Injectable for tests; defaults to a real client reading ANTHROPIC_API_KEY. */
  client?: Anthropic;
}

export interface RunToolAgentResult<T> {
  output: T;
  toolCallCount: number;
  tokensUsed: number;
  repaired: boolean;
}

export class AgentBoundsExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentBoundsExceededError';
  }
}

export class AgentOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentOutputValidationError';
  }
}

const DEFAULT_MAX_TOOL_CALLS = 5;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TOKEN_BUDGET = 20_000;
// Worker-tool round-trips + the mandatory repair nudge + the final output call.
const MAX_ITERATIONS_HEADROOM = 3;

export async function runToolAgent<T>(params: RunToolAgentParams<T>): Promise<RunToolAgentResult<T>> {
  const client = params.client ?? new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  const maxToolCalls = params.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  const tokenBudget = params.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const workerTools = params.tools ?? [];

  const anthropicTools: Anthropic.Beta.Tools.Tool[] = [
    ...workerTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.Tools.Tool.InputSchema })),
    { name: params.outputToolName, description: params.outputToolDescription, input_schema: params.outputJsonSchema as Anthropic.Beta.Tools.Tool.InputSchema },
  ];

  const messages: Anthropic.Beta.Tools.ToolsBetaMessageParam[] = [{ role: 'user', content: params.userPrompt }];
  let toolCallCount = 0;
  let tokensUsed = 0;
  let repairAttempted = false;

  for (let iteration = 0; iteration < maxToolCalls + MAX_ITERATIONS_HEADROOM; iteration++) {
    const response = await client.beta.tools.messages.create({
      model: params.model,
      max_tokens: maxTokens,
      system: params.systemPrompt,
      temperature: params.temperature ?? 0.5,
      tools: anthropicTools,
      messages,
    });

    tokensUsed += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    if (tokensUsed > tokenBudget) {
      throw new AgentBoundsExceededError(`Token budget exceeded: ${tokensUsed} > ${tokenBudget}`);
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Beta.Tools.ToolUseBlock => b.type === 'tool_use',
    );
    const outputBlock = toolUseBlocks.find((b) => b.name === params.outputToolName);

    if (outputBlock) {
      const parsed = params.outputZodSchema.safeParse(outputBlock.input);
      if (parsed.success) {
        return { output: parsed.data, toolCallCount, tokensUsed, repaired: repairAttempted };
      }

      if (repairAttempted) {
        throw new AgentOutputValidationError(
          `Agent output failed validation after repair attempt: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      repairAttempted = true;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: outputBlock.id,
          is_error: true,
          content: [{
            type: 'text',
            text: `Invalid input for ${params.outputToolName}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}. Call ${params.outputToolName} again with corrected input that matches the schema exactly.`,
          }],
        }],
      });
      continue;
    }

    if (toolUseBlocks.length > 0) {
      toolCallCount += toolUseBlocks.length;
      if (toolCallCount > maxToolCalls) {
        throw new AgentBoundsExceededError(`Max tool calls exceeded: ${toolCallCount} > ${maxToolCalls}`);
      }
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Beta.Tools.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const handler = workerTools.find((t) => t.name === block.name);
        const result = handler ? await handler.execute(block.input) : { error: `Unknown tool ${block.name}` };
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [{ type: 'text', text: JSON.stringify(result) }] });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // No tool use at all — nudge the model back onto the output tool once.
    if (repairAttempted) {
      throw new AgentOutputValidationError(`Agent did not call ${params.outputToolName} after a repair nudge`);
    }
    repairAttempted = true;
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: `You must call the ${params.outputToolName} tool with your final answer. Do not respond with plain text.` });
  }

  throw new AgentBoundsExceededError('Agent exceeded maximum iterations without producing valid output');
}
