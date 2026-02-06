import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import type { AIStatsConfig, AIStatsModelSettings } from './ai-stats-settings.js';
import { convertToGatewayChatRequest } from './convert-to-gateway-chat.js';
import { mapGatewayResponse } from './map-gateway-response.js';
import { parseSSEStream } from './utils/parse-sse-stream.js';
import { mapGatewayFinishReason } from './map-gateway-finish-reason.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';
import { mapGatewayUsage } from './map-gateway-usage.js';
import { headersToRecord } from './utils/headers.js';

/**
 * AI Stats Language Model implementation for Vercel AI SDK v6
 */
export class AIStatsLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'ai-stats' as const;
  readonly modelId: string;
  readonly supportedUrls = {};
  readonly defaultObjectGenerationMode = 'json' as const;

  private readonly config: AIStatsConfig;
  private readonly settings: AIStatsModelSettings;

  constructor(
    modelId: string,
    config: AIStatsConfig,
    settings: AIStatsModelSettings = {}
  ) {
    this.modelId = modelId;
    this.config = config;
    this.settings = settings;
  }

  /**
   * Generate a non-streaming response
   */
  async doGenerate(options: LanguageModelV3CallOptions) {
    const { prompt, abortSignal } = options;

    // Convert AI SDK prompt to gateway format
    const gatewayRequest = convertToGatewayChatRequest(
      prompt,
      this.modelId,
      this.settings,
      options
    );

    // Make the API request
    const url = `${this.config.baseURL}/chat/completions`;
    const fetchImpl = this.config.fetch ?? fetch;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify({
        ...gatewayRequest,
        stream: false,
      }),
      signal: abortSignal,
    });

    // Handle errors
    if (!response.ok) {
      const errorHandler = createAIStatsErrorHandler();
      throw (await errorHandler({ url, requestBodyValues: gatewayRequest, response })).value;
    }

    // Parse and map response
    const data = await response.json();
    const responseHeaders = headersToRecord(response.headers);
    const mapped = mapGatewayResponse(data, options, gatewayRequest, responseHeaders);

    return mapped;
  }

  /**
   * Generate a streaming response
   */
  async doStream(options: LanguageModelV3CallOptions) {
    const { prompt, abortSignal } = options;

    // Convert AI SDK prompt to gateway format
    const gatewayRequest = convertToGatewayChatRequest(
      prompt,
      this.modelId,
      this.settings,
      options
    );

    // Make the API request
    const url = `${this.config.baseURL}/chat/completions`;
    const fetchImpl = this.config.fetch ?? fetch;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify({
        ...gatewayRequest,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: abortSignal,
    });

    // Handle errors
    if (!response.ok) {
      const errorHandler = createAIStatsErrorHandler();
      throw (await errorHandler({ url, requestBodyValues: gatewayRequest, response })).value;
    }

    // Parse SSE stream and emit AI SDK events
    const warnings: any[] = [];
    let finishReason: LanguageModelV3FinishReason = mapGatewayFinishReason(undefined);
    let rawUsage: any = undefined;

    const textIds = new Map<number, { id: string; started: boolean }>();
    const reasoningIds = new Map<number, { id: string; started: boolean }>();

    const toolCalls = new Map<
      number,
      { id: string; toolName: string; started: boolean }
    >();

    const emitTextDelta = (
      controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
      index: number,
      delta: string
    ) => {
      const textState =
        textIds.get(index) ?? { id: `text-${index}`, started: false };
      if (!textState.started) {
        controller.enqueue({
          type: 'text-start',
          id: textState.id,
        });
        textState.started = true;
        textIds.set(index, textState);
      }
      controller.enqueue({
        type: 'text-delta',
        id: textState.id,
        delta,
      });
    };

    const emitReasoningDelta = (
      controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
      index: number,
      delta: string
    ) => {
      const reasoningState =
        reasoningIds.get(index) ?? {
          id: `reasoning-${index}`,
          started: false,
        };
      if (!reasoningState.started) {
        controller.enqueue({
          type: 'reasoning-start',
          id: reasoningState.id,
        });
        reasoningState.started = true;
        reasoningIds.set(index, reasoningState);
      }
      controller.enqueue({
        type: 'reasoning-delta',
        id: reasoningState.id,
        delta,
      });
    };

    const responseHeaders = headersToRecord(response.headers);

    return {
      stream: parseSSEStream(response).pipeThrough(
        new TransformStream<any, LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({
              type: 'stream-start',
              warnings,
            });
          },
          transform(chunk, controller) {
            const payload = (chunk as any)?.data ?? chunk;
            const event = (chunk as any)?.event ?? payload?.type;

            if (typeof event === 'string' && event.startsWith('response.')) {
              const index = payload?.output_index ?? 0;
              if (event === 'response.output_text.delta') {
                const delta = extractTextDelta(payload?.delta);
                if (delta) {
                  emitTextDelta(controller, index, delta);
                }
              } else if (event === 'response.reasoning_text.delta') {
                const delta = extractTextDelta(payload?.delta);
                if (delta) {
                  emitReasoningDelta(controller, index, delta);
                }
              } else if (event === 'response.completed') {
                const completedUsage = payload?.response?.usage;
                if (completedUsage) {
                  rawUsage = completedUsage;
                }
                finishReason = mapGatewayFinishReason(
                  payload?.response?.status === 'completed' ? 'stop' : 'error'
                );
              }
              return;
            }

            // Handle stream chunk
            if (payload?.choices && payload.choices.length > 0) {
              const choice = payload.choices[0];
              const delta = choice.delta;

              // Emit text deltas
              const contentDelta = extractTextDelta(delta?.content);
              if (contentDelta) {
                emitTextDelta(controller, choice.index ?? 0, contentDelta);
              }

              const reasoningDelta = extractTextDelta(
                delta?.reasoning_content ?? delta?.reasoning_text ?? delta?.reasoning
              );
              if (reasoningDelta) {
                emitReasoningDelta(controller, choice.index ?? 0, reasoningDelta);
              }

              // Emit tool call deltas
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const index = toolCall.index ?? 0;

                  const current =
                    toolCalls.get(index) ?? {
                      id: toolCall.id ?? `tool-${index}`,
                      toolName: toolCall.function?.name ?? '',
                      started: false,
                    };
                  if (toolCall.id) {
                    current.id = toolCall.id;
                  }
                  if (toolCall.function?.name) {
                    current.toolName = toolCall.function.name;
                  }

                  if (!current.started) {
                    controller.enqueue({
                      type: 'tool-input-start',
                      id: current.id,
                      toolName: current.toolName,
                    });
                    current.started = true;
                    toolCalls.set(index, current);
                  }

                  if (toolCall.function?.arguments) {
                    controller.enqueue({
                      type: 'tool-input-delta',
                      id: current.id,
                      delta: toolCall.function.arguments,
                    });
                  }
                }
              }

              // Handle finish reason
              if (choice.finish_reason) {
                finishReason = mapGatewayFinishReason(choice.finish_reason);
              }
            }

            // Handle usage in final chunk
            if (payload?.usage) {
              rawUsage = payload.usage;
            }
          },

          flush(controller) {
            for (const { id, started } of textIds.values()) {
              if (started) {
                controller.enqueue({
                  type: 'text-end',
                  id,
                });
              }
            }
            for (const { id, started } of reasoningIds.values()) {
              if (started) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id,
                });
              }
            }
            for (const { id, started } of toolCalls.values()) {
              if (started) {
                controller.enqueue({
                  type: 'tool-input-end',
                  id,
                });
              }
            }

            // Emit finish event
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: mapGatewayUsage(rawUsage ?? {}),
            });
          },
        })
      ),
      request: {
        body: gatewayRequest,
      },
      response: {
        headers: responseHeaders,
      },
    };
  }
}

function extractTextDelta(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  const textParts = content
    .filter((part: any) => part?.type === 'text' || part?.type === 'output_text')
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .filter((text: string) => text.length > 0);

  if (textParts.length === 0) {
    return undefined;
  }

  return textParts.join('');
}
