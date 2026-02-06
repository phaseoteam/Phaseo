import type { LanguageModelV3FinishReason } from '@ai-sdk/provider';

/**
 * Maps AI Stats Gateway finish reasons to AI SDK finish reasons
 */
export function mapGatewayFinishReason(
  finishReason: string | null | undefined
): LanguageModelV3FinishReason {
  let unified: LanguageModelV3FinishReason['unified'] = 'other';

  switch (finishReason) {
    case 'stop':
      unified = 'stop';
      break;
    case 'length':
    case 'max_tokens':
      unified = 'length';
      break;
    case 'content_filter':
    case 'content_policy_violation':
      unified = 'content-filter';
      break;
    case 'tool_calls':
    case 'function_call':
      unified = 'tool-calls';
      break;
    case 'error':
      unified = 'error';
      break;
    default:
      unified = 'other';
  }

  return {
    unified,
    raw: finishReason ?? undefined,
  };
}
