/**
 * Anthropic SDK Compatibility Layer
 * Drop-in replacement for '@anthropic-ai/sdk' package
 *
 * Usage:
 *   import { Anthropic } from '@ai-stats/sdk/compat/anthropic';
 *   const anthropic = new Anthropic({ apiKey: '...' });
 *   const message = await anthropic.messages.create({...});
 */

import { AIStats } from "../index.js";
import type {
  ChatCompletionsRequest,
  ChatCompletionsResponse,
  ChatMessage
} from "../oapi-gen/models/index.js";

type AnthropicConfig = {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
};

type MessageRole = 'user' | 'assistant';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type?: string; data: string } };

type MessageParam = {
  role: MessageRole;
  content: string | ContentBlock[];
};

type MessageCreateParams = {
  model: string;
  messages: MessageParam[];
  max_tokens: number;
  system?: string | Array<{ type: 'text'; text: string }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: Record<string, unknown>;
};

type MessageCreateParamsStreaming = MessageCreateParams & {
  stream: true;
};

type MessageCreateParamsNonStreaming = MessageCreateParams & {
  stream?: false;
};

type Message = {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

/**
 * Convert Anthropic message format to OpenAI chat format
 */
function anthropicToOpenAI(params: MessageCreateParams): ChatCompletionsRequest {
  const messages: any[] = [];

  // Add system message if present
  if (params.system) {
    const systemContent = typeof params.system === 'string'
      ? params.system
      : params.system.map(block => block.text).join('\n');

    messages.push({
      role: 'system',
      content: systemContent
    });
  }

  // Convert messages
  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    } else {
      // Handle content blocks
      const textBlocks = msg.content.filter(b => b.type === 'text');
      if (textBlocks.length > 0) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
  }

  return {
    model: params.model,
    messages,
    max_output_tokens: params.max_tokens,
    temperature: params.temperature,
    top_p: params.top_p,
    stop: params.stop_sequences
  } as any;
}

/**
 * Convert OpenAI response to Anthropic format
 */
function openAIToAnthropic(response: ChatCompletionsResponse): Message {
  const choice = response.choices?.[0];
  const rawContent = choice?.message?.content;
  const content = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent
          .map((part) =>
            typeof part === "string" ? part : (part as { text?: string }).text ?? ""
          )
          .filter(Boolean)
          .join("\n")
      : "";

  return {
    id: response.id || 'msg_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: response.model || '',
    stop_reason: choice?.finish_reason || null,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0
    }
  };
}

/**
 * Anthropic SDK-compatible client
 * Mimics the official Anthropic SDK interface
 */
export class Anthropic {
  private readonly aiStats: AIStats;

  // Nested resource accessors (matching Anthropic SDK structure)
  public readonly messages: {
    create(params: MessageCreateParamsNonStreaming): Promise<Message>;
    create(params: MessageCreateParamsStreaming): AsyncIterable<string>;
    create(params: MessageCreateParams): Promise<Message> | AsyncIterable<string>;
  };

  constructor(config: AnthropicConfig) {
    // Map Anthropic config to AIStats config
    this.aiStats = new AIStats({
      apiKey: config.apiKey,
      baseUrl: config.baseURL,
      timeoutMs: config.timeout
    });

    // Messages
    this.messages = {
      create: ((params: MessageCreateParams) => {
        const openAIParams = anthropicToOpenAI(params);

        if (params.stream) {
          // Return streaming response
          return this.aiStats.streamText(openAIParams as any);
        }

        // Return non-streaming response
        return this.aiStats.generateText(openAIParams as any)
          .then(openAIToAnthropic);
      }) as any
    };
  }

  /**
   * Direct access to underlying AIStats client
   * For features not available in Anthropic SDK
   */
  get native(): AIStats {
    return this.aiStats;
  }
}

/**
 * Re-export types for convenience
 */
export type {
  MessageCreateParams,
  MessageCreateParamsStreaming,
  MessageCreateParamsNonStreaming,
  Message,
  MessageParam,
  ContentBlock,
  MessageRole
};

/**
 * Default export for ESM compatibility
 */
export default Anthropic;
