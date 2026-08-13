import { z } from 'zod';
import { AI_CONFIG } from '../../../config/ai.config';
import { estimateUsd } from './cost';
import { JsonRepairError, repairJson } from './json-repair';
import type { LlmContentBlock, LlmMessage, LlmPort, LlmToolSpec } from './llm-port';

export class AgentRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

export class AgentBudgetError extends AgentRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentBudgetError';
  }
}

export interface AgentToolDef {
  name: string;
  description: string;
  inputSchema: LlmToolSpec['input_schema'];
  execute?: (input: unknown) => Promise<unknown> | unknown;
  terminal?: boolean;
}

export interface AgentDefinition<T> {
  name: string;
  systemPrompt: string;
  tools: AgentToolDef[];
  outputSchema: z.ZodType<T>;
  terminalToolName: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AgentBudget {
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  maxTokens: number;
  maxCostUsd: number;
  maxToolCalls: number;
}

export interface AgentRunResult<T> {
  output: T;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  repaired: boolean;
  costUsd: number;
}

export function createAgentBudget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return {
    tokensUsed: 0,
    costUsd: 0,
    toolCalls: 0,
    maxTokens: AI_CONFIG.video.maxTokensPerVideo,
    maxCostUsd: AI_CONFIG.video.maxCostUsdPerVideo,
    maxToolCalls: AI_CONFIG.video.maxToolCallsPerAgent,
    ...overrides,
  };
}

export function assertAgentBudget(budget: AgentBudget): void {
  if (budget.tokensUsed >= budget.maxTokens) {
    throw new AgentBudgetError(
      `Per-video token ceiling reached (${budget.tokensUsed}/${budget.maxTokens})`,
    );
  }
  if (budget.costUsd >= budget.maxCostUsd) {
    throw new AgentBudgetError(
      `Per-video cost ceiling reached ($${budget.costUsd.toFixed(4)} / $${budget.maxCostUsd})`,
    );
  }
}

export async function runAgent<T>(opts: {
  definition: AgentDefinition<T>;
  userPrompt: string;
  llm: LlmPort;
  budget: AgentBudget;
}): Promise<AgentRunResult<T>> {
  const { definition, llm, budget } = opts;
  const model = definition.model ?? AI_CONFIG.models.premiumText.modelId;
  const maxTokens = definition.maxTokens ?? AI_CONFIG.video.scriptMaxTokens;
  const tools = definition.tools.map(toLlmTool);
  const messages: LlmMessage[] = [{ role: 'user', content: opts.userPrompt }];

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let repaired = false;
  let toolCalls = 0;

  for (let turn = 0; turn < budget.maxToolCalls; turn++) {
    assertAgentBudget(budget);

    const response = await llm.messagesCreate({
      model,
      maxTokens,
      system: definition.systemPrompt,
      temperature: definition.temperature ?? AI_CONFIG.models.premiumText.temperature,
      tools,
      messages,
    });

    tokensIn += response.usage.inputTokens;
    tokensOut += response.usage.outputTokens;
    const turnCost = estimateUsd(model, response.usage.inputTokens, response.usage.outputTokens);
    costUsd += turnCost;
    budget.tokensUsed += response.usage.inputTokens + response.usage.outputTokens;
    budget.costUsd += turnCost;

    const toolUses = response.content.filter(
      (block): block is Extract<LlmContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    const text = response.content
      .filter((block): block is Extract<LlmContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const terminalUse = toolUses.find((use) => use.name === definition.terminalToolName);
    if (terminalUse) {
      toolCalls += 1;
      budget.toolCalls += 1;
      try {
        const parsed = coerceToSchema(definition.outputSchema, terminalUse.input);
        repaired = repaired || parsed.repaired;
        return {
          output: parsed.value,
          tokensIn,
          tokensOut,
          toolCalls,
          repaired,
          costUsd,
        };
      } catch (err) {
        throw new AgentRuntimeError(
          `${definition.name} terminal tool failed schema: ${err instanceof Error ? err.message : 'invalid output'}`,
        );
      }
    }

    if (toolUses.length === 0) {
      if (!text) {
        throw new AgentRuntimeError(`${definition.name} returned empty output`);
      }
      try {
        const parsed = coerceToSchema(definition.outputSchema, text);
        return {
          output: parsed.value,
          tokensIn,
          tokensOut,
          toolCalls,
          repaired: true,
          costUsd,
        };
      } catch (err) {
        if (err instanceof JsonRepairError || err instanceof z.ZodError) {
          throw new AgentRuntimeError(
            `${definition.name} output failed schema and could not be repaired`,
          );
        }
        throw err;
      }
    }

    const toolResults: LlmContentBlock[] = [];
    for (const use of toolUses) {
      toolCalls += 1;
      budget.toolCalls += 1;
      if (budget.toolCalls > budget.maxToolCalls) {
        throw new AgentBudgetError(
          `Max tool calls exceeded (${budget.toolCalls}/${budget.maxToolCalls})`,
        );
      }
      const tool = definition.tools.find((candidate) => candidate.name === use.name);
      if (!tool?.execute) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Unknown tool: ${use.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const result = await tool.execute(use.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: stringifyToolResult(result),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: err instanceof Error ? err.message : 'Tool failed',
          is_error: true,
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  throw new AgentBudgetError(
    `${definition.name} exceeded max tool calls (${budget.maxToolCalls}) without a valid output`,
  );
}

function toLlmTool(tool: AgentToolDef): LlmToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function coerceToSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { value: T; repaired: boolean } {
  const direct = schema.safeParse(input);
  if (direct.success) return { value: direct.data, repaired: false };

  if (typeof input === 'string') {
    const repaired = repairJson(input);
    return { value: schema.parse(repaired), repaired: true };
  }

  throw direct.error;
}
