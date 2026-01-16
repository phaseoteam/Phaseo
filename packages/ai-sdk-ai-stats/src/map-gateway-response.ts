import type { LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { mapGatewayFinishReason } from './map-gateway-finish-reason.js';

/**
 * Maps AI Stats Gateway response to AI SDK format
 */
export function mapGatewayResponse(
  response: any,
  _options: LanguageModelV1CallOptions,
  gatewayRequest: any
) {
  const choice = response.choices?.[0];

  if (!choice) {
    throw new Error('No choices in gateway response');
  }

  const message = choice.message;

  // Extract text content
  let text: string | undefined;
  if (typeof message.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    // Concatenate text parts
    text = message.content
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.text)
      .join('');
  }

  // Extract tool calls
  const toolCalls = message.tool_calls?.map((toolCall: any) => {
    return {
      toolCallType: 'function' as const,
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      args: toolCall.function.arguments, // Keep as string per interface
    };
  });

  // Extract usage
  const usage = response.usage
    ? {
        promptTokens: response.usage.prompt_tokens ?? 0,
        completionTokens: response.usage.completion_tokens ?? 0,
      }
    : {
        promptTokens: 0,
        completionTokens: 0,
      };

  // Map finish reason
  const finishReason = mapGatewayFinishReason(choice.finish_reason);

  // Build common return structure
  return {
    text,
    toolCalls,
    finishReason,
    usage,
    rawCall: {
      rawPrompt: gatewayRequest.messages,
      rawSettings: gatewayRequest,
    },
    rawResponse: {
      headers: {},
      body: response,
    },
    response: {
      id: response.id,
      timestamp: response.created ? new Date(response.created * 1000) : undefined,
      modelId: response.model,
    },
    warnings: [],
  };
}
