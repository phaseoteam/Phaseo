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
import { mapGatewayUsage } from './map-gateway-usage.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';

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
    const mapped = mapGatewayResponse(data, options, gatewayRequest);

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

    let finishReason: LanguageModelV3FinishReason = mapGatewayFinishReason(undefined);
    let usage = mapGatewayUsage({});
    const textPartId = 'text-0';
    let textPartStarted = false;

    const toolCalls: Array<{
      id: string;
      toolName: string;
      input: string;
      started: boolean;
    }> = [];

    const requestBodyJson = JSON.stringify({
      ...gatewayRequest,
      stream: true,
      stream_options: { include_usage: true },
    });

    return {
      stream: parseSSEStream(response).pipeThrough(
        new TransformStream<any, LanguageModelV3StreamPart>({
          transform(chunk, controller) {
            if (chunk?.error) {
              controller.enqueue({
                type: 'error',
                error: chunk.error,
              });
              return;
            }

            if (chunk?.object === 'chat.completion.chunk') {
              controller.enqueue({
                type: 'raw',
                rawValue: chunk,
              });
            }

            // Handle stream chunk
            if (chunk.choices && chunk.choices.length > 0) {
              const choice = chunk.choices[0];
              const delta = choice.delta;

              // Emit text deltas
              if (delta?.content) {
                if (!textPartStarted) {
                  textPartStarted = true;
                  controller.enqueue({
                    type: 'text-start',
                    id: textPartId,
                  });
                }

                controller.enqueue({
                  type: 'text-delta',
                  id: textPartId,
                  delta: delta.content,
                });
              }

              // Emit tool call deltas
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const index = toolCall.index ?? 0;
                  const toolId = toolCall.id ?? toolCalls[index]?.id ?? `tool-${index}`;
                  const toolName = toolCall.function?.name ?? toolCalls[index]?.toolName ?? '';

                  if (!toolCalls[index]) {
                    toolCalls[index] = {
                      id: toolId,
                      toolName,
                      input: '',
                      started: false,
                    };
                  } else {
                    toolCalls[index].id = toolId;
                    if (toolName) {
                      toolCalls[index].toolName = toolName;
                    }
                  }

                  if (!toolCalls[index].started) {
                    toolCalls[index].started = true;
                    controller.enqueue({
                      type: 'tool-input-start',
                      id: toolCalls[index].id,
                      toolName: toolCalls[index].toolName,
                    });
                  }

                  if (toolCall.function?.arguments) {
                    toolCalls[index].input += toolCall.function.arguments;

                    controller.enqueue({
                      type: 'tool-input-delta',
                      id: toolCalls[index].id,
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
            if (chunk.usage) {
              usage = mapGatewayUsage(chunk.usage);
            }
          },

          flush(controller) {
            if (textPartStarted) {
              controller.enqueue({
                type: 'text-end',
                id: textPartId,
              });
            }

            for (const toolCall of toolCalls) {
              if (!toolCall) {
                continue;
              }

              if (toolCall.started) {
                controller.enqueue({
                  type: 'tool-input-end',
                  id: toolCall.id,
                });
              }

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id,
                toolName: toolCall.toolName,
                input: toolCall.input,
              });
            }

            // Emit finish event
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
            });
          },
        })
      ),
      response: {
        headers: Object.fromEntries(Array.from(response.headers as any) as [string, string][]),
      },
      request: {
        body: requestBodyJson,
      },
    };
  }
}
