export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
}

export interface LlmToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

export interface LlmResponse {
  stopReason: string | null;
  content: LlmContentBlock[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmPort {
  messagesCreate(req: {
    model: string;
    maxTokens: number;
    system: string;
    temperature?: number;
    tools: LlmToolSpec[];
    messages: LlmMessage[];
  }): Promise<LlmResponse>;
}
