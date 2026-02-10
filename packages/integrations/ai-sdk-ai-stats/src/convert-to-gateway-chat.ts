import type { LanguageModelV3Prompt, LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { AIStatsModelSettings } from './ai-stats-settings.js';
import { prepareTools } from './utils/prepare-tools.js';

/**
 * Converts AI SDK prompt format to AI Stats Gateway /chat/completions format
 */
export function convertToGatewayChatRequest(
  prompt: LanguageModelV3Prompt,
  modelId: string,
  settings: AIStatsModelSettings,
  options: LanguageModelV3CallOptions
): any {
  const messages = prompt
    .map((message) => {
      switch (message.role) {
        case 'system':
          return {
            role: 'system',
            content: message.content,
          };

        case 'user':
          return {
            role: 'user',
            content: convertContent(message.content),
          };

        case 'assistant': {
          const assistantMessage: any = {
            role: 'assistant',
            content: convertContent(message.content),
          };

          const toolCalls = message.content
            .filter((part): part is Extract<typeof part, { type: 'tool-call' }> => part.type === 'tool-call')
            .map((toolCall) => ({
              id: toolCall.toolCallId,
              type: 'function',
              function: {
                name: toolCall.toolName,
                arguments: JSON.stringify(toolCall.input ?? {}),
              },
            }));

          if (toolCalls.length > 0) {
            assistantMessage.tool_calls = toolCalls;
          }

          return assistantMessage;
        }

        case 'tool':
          return message.content
            .filter((part): part is Extract<typeof part, { type: 'tool-result' }> => part.type === 'tool-result')
            .map((toolResult) => ({
              role: 'tool',
              tool_call_id: toolResult.toolCallId,
              content: serializeToolOutput(toolResult.output),
            }));
      }
    })
    .flat();

  // Prepare request body
  const body: any = {
    model: modelId,
    messages,
  };

  // Add generation parameters from options
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  const maxTokens =
    (options as any).maxTokens ?? (options as any).maxOutputTokens;
  if (maxTokens !== undefined) {
    body.max_tokens = maxTokens;
  }
  if (options.topP !== undefined) {
    body.top_p = options.topP;
  }
  if (options.topK !== undefined) {
    body.top_k = options.topK;
  }
  if (options.frequencyPenalty !== undefined) {
    body.frequency_penalty = options.frequencyPenalty;
  }
  if (options.presencePenalty !== undefined) {
    body.presence_penalty = options.presencePenalty;
  }
  if (options.seed !== undefined) {
    body.seed = options.seed;
  }

  // Add settings parameters
  if (settings.user !== undefined) {
    body.user = settings.user;
  }

  const mode = (options as any).mode;
  const tools =
    (options as any).tools ??
    (mode?.type === 'regular' ? mode.tools : mode?.type === 'object-tool' ? [mode.tool] : undefined);

  if (tools && tools.length > 0) {
    body.tools = prepareTools(tools);
  }

  const toolChoice =
    (options as any).toolChoice ??
    (mode?.type === 'regular' ? mode.toolChoice : undefined);

  if (toolChoice) {
    body.tool_choice = convertToolChoice(toolChoice);
  } else if (mode?.type === 'object-tool' && mode.tool?.name) {
    body.tool_choice = {
      type: 'function',
      function: { name: mode.tool.name },
    };
  }

  // Add response format for structured output modes
  if (mode?.type === 'object-json') {
    body.response_format = { type: 'json_object' };
  }

  return body;
}

/**
 * Converts AI SDK content parts to gateway format
 */
function convertContent(content: any): string | any[] {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const normalized = content
    .filter((part: any) => part.type !== 'tool-call' && part.type !== 'tool-result')
    .map((part: any) => {
      switch (part.type) {
        case 'text':
          return {
            type: 'text',
            text: part.text,
          };
        case 'reasoning':
          return {
            type: 'text',
            text: part.text,
          };
        case 'file':
          if (typeof part.mediaType === 'string' && part.mediaType.startsWith('image/')) {
            return {
              type: 'image_url',
              image_url: {
                url: toImageUrl(part.data, part.mediaType),
              },
            };
          }

          return {
            type: 'text',
            text: `[File: ${part.mediaType}]`,
          };
        default:
          return {
            type: 'text',
            text: '',
          };
      }
    });

  const textParts = normalized.filter((part: any) => part.type === 'text');
  const hasOnlyText = textParts.length === normalized.length;

  if (hasOnlyText && textParts.length === 1) {
    return textParts[0].text;
  }

  return normalized;
}

function toImageUrl(data: unknown, mediaType: string): string {
  if (data instanceof URL) {
    return data.toString();
  }

  if (data instanceof Uint8Array) {
    return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`;
  }

  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://') || data.startsWith('data:')) {
      return data;
    }

    return `data:${mediaType};base64,${data}`;
  }

  return '';
}

function serializeToolOutput(output: any): string {
  if (!output || typeof output !== 'object') {
    return JSON.stringify(output ?? null);
  }

  switch (output.type) {
    case 'text':
    case 'error-text':
      return String(output.value ?? '');
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value ?? null);
    case 'execution-denied':
      return JSON.stringify({ type: 'execution-denied', reason: output.reason });
    case 'content':
      return JSON.stringify(output.value ?? []);
    default:
      return JSON.stringify(output);
  }
}

/**
 * Converts AI SDK tool choice to gateway format
 */
function convertToolChoice(toolChoice: any): any {
  if (!toolChoice) {
    return undefined;
  }

  switch (toolChoice.type) {
    case 'auto':
      return 'auto';

    case 'none':
      return 'none';

    case 'required':
      return 'required';

    case 'tool':
      return {
        type: 'function',
        function: {
          name: toolChoice.toolName,
        },
      };

    default:
      return 'auto';
  }
}
