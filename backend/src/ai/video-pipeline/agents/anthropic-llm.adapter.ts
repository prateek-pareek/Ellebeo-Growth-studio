import Anthropic from '@anthropic-ai/sdk';
import type { LlmMessage, LlmPort, LlmResponse } from './llm-port';

type BetaToolResult = {
  type: 'tool_result';
  tool_use_id: string;
  content?: Array<{ type: 'text'; text: string }>;
  is_error?: boolean;
};

export function createAnthropicLlmPort(
  apiKey = process.env['ANTHROPIC_API_KEY'],
): LlmPort {
  const client = new Anthropic({ apiKey: apiKey ?? null });

  return {
    async messagesCreate(req): Promise<LlmResponse> {
      const response = await client.beta.tools.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        temperature: req.temperature,
        tools: req.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema,
        })),
        messages: req.messages.map(toBetaMessage),
      });

      return {
        stopReason: response.stop_reason,
        content: response.content.map((block) => {
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use' as const,
              id: block.id,
              name: block.name,
              input: block.input,
            };
          }
          return { type: 'text' as const, text: block.text };
        }),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

function toBetaMessage(message: LlmMessage) {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content };
  }

  const content = message.content.map((block) => {
    if (block.type === 'tool_result') {
      const result: BetaToolResult = {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: [{ type: 'text', text: block.content }],
      };
      if (block.is_error) result.is_error = true;
      return result;
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }
    return { type: 'text' as const, text: block.text };
  });

  return { role: message.role, content };
}
