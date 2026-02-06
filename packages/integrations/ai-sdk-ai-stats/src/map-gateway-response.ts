import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { mapGatewayFinishReason } from './map-gateway-finish-reason.js';
import { mapGatewayUsage } from './map-gateway-usage.js';

/**
 * Maps AI Stats Gateway response to AI SDK format
 */
export function mapGatewayResponse(
  response: any,
  _options: LanguageModelV3CallOptions,
  gatewayRequest: any,
  responseHeaders?: Record<string, string>
): LanguageModelV3GenerateResult {
  const choice = response.choices?.[0];

  if (!choice) {
    throw new Error('No choices in gateway response');
  }

  const message = choice.message;

  const content: Array<any> = [];

  // Extract text content
  let text: string | undefined;
  if (typeof message?.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message?.content)) {
    text = message.content
      .filter((part: any) => part.type === 'text' || part.type === 'output_text')
      .map((part: any) => part.text)
      .join('');
  }
  if (text) {
    content.push({ type: 'text', text });
  }

  // Extract tool calls
  if (Array.isArray(message?.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      content.push({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.function?.name ?? '',
        input: toolCall.function?.arguments ?? '',
      });
    }
  }

  // Map finish reason + usage
  const finishReason = mapGatewayFinishReason(choice.finish_reason);
  const usage = mapGatewayUsage(response?.usage ?? {});

  return {
    content,
    finishReason,
    usage,
    request: {
      body: gatewayRequest,
    },
    response: {
      id: response?.id,
      timestamp: response?.created ? new Date(response.created * 1000) : undefined,
      modelId: response?.model,
      headers: responseHeaders,
      body: response,
    },
    warnings: [],
  };
}
