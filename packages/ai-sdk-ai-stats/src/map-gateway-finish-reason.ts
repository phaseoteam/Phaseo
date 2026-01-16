import type { LanguageModelV1FinishReason } from '@ai-sdk/provider';

/**
 * Maps AI Stats Gateway finish reasons to AI SDK finish reasons
 */
export function mapGatewayFinishReason(
  finishReason: string | null | undefined
): LanguageModelV1FinishReason {
  if (!finishReason) {
    return 'unknown';
  }

  switch (finishReason) {
    case 'stop':
      return 'stop';

    case 'length':
    case 'max_tokens':
      return 'length';

    case 'content_filter':
    case 'content_policy_violation':
      return 'content-filter';

    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';

    case 'error':
      return 'error';

    default:
      return 'other';
  }
}
