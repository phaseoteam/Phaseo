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
  // Convert messages - prompt is an array of messages
  const messages = prompt.map((message) => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: convertContent(message.content),
        };

      case 'user':
        return {
          role: 'user',
          content: convertContent(message.content),
        };

      case 'assistant':
        const assistantMessage: any = {
          role: 'assistant',
          content: convertContent(message.content),
        };

        // Add tool calls if present
        if (message.content.some((part) => part.type === 'tool-call')) {
          assistantMessage.tool_calls = message.content
            .filter((part): part is Extract<typeof part, { type: 'tool-call' }> => part.type === 'tool-call')
            .map((toolCall) => ({
              id: toolCall.toolCallId,
              type: 'function',
              function: {
                name: toolCall.toolName,
                arguments: JSON.stringify(toolCall.input),
              },
            }));
        }

        return assistantMessage;

      case 'tool':
        // Map tool results to gateway format
        return message.content
          .filter((part) => part.type === 'tool-result')
          .map((toolResult) => ({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: serializeToolResult(toolResult.output),
          }));
    }
  }).flat(); // Flatten because tool messages can expand to multiple messages

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
  // Handle string content
  if (typeof content === 'string') {
    return content;
  }

  // Handle array of content parts
  if (!Array.isArray(content)) {
    return '';
  }

  // If only text content, return as string
  const textParts = content.filter((part: any) => part.type === 'text');
  const hasOnlyText = textParts.length === content.length;

  if (hasOnlyText && textParts.length === 1) {
    return textParts[0].text;
  }

  // Otherwise, return as array of content parts
  return content
    .filter((part) => part.type !== 'tool-call' && part.type !== 'tool-result') // Tool parts handled separately
    .map((part) => {
      switch (part.type) {
        case 'text':
          return {
            type: 'text',
            text: part.text,
          };

        case 'image':
          if (part.image instanceof URL) {
            return {
              type: 'image_url',
              image_url: {
                url: part.image.toString(),
              },
            };
          } else {
            // Base64 or Buffer
            const base64 = part.image instanceof Uint8Array
              ? Buffer.from(part.image).toString('base64')
              : part.image.toString('base64');

            return {
              type: 'image_url',
              image_url: {
                url: `data:${part.mimeType ?? 'image/jpeg'};base64,${base64}`,
              },
            };
          }

        case 'file':
          return mapFilePart(part);

        default:
          return {
            type: 'text',
            text: '',
          };
      }
    });
}

function serializeToolResult(output: any): string {
  if (!output || typeof output !== 'object') {
    return JSON.stringify(output ?? '');
  }
  switch (output.type) {
    case 'text':
      return output.value ?? '';
    case 'json':
      return JSON.stringify(output.value ?? {});
    case 'execution-denied':
      return output.reason ? `Execution denied: ${output.reason}` : 'Execution denied';
    case 'error-text':
      return output.value ?? '';
    default:
      return JSON.stringify(output);
  }
}

function mapFilePart(part: any) {
  const mediaType: string | undefined = part.mediaType ?? part.mimeType;
  const data = part.data ?? part.image;

  if (mediaType && mediaType.startsWith('image/')) {
    if (data instanceof URL) {
      return {
        type: 'image_url',
        image_url: {
          url: data.toString(),
        },
      };
    }
    const base64 = data instanceof Uint8Array
      ? Buffer.from(data).toString('base64')
      : data?.toString('base64');
    if (base64) {
      return {
        type: 'image_url',
        image_url: {
          url: `data:${mediaType};base64,${base64}`,
        },
      };
    }
  }

  // Fallback to a text reference when we can't map the file
  return {
    type: 'text',
    text: mediaType ? `[File: ${mediaType}]` : '[File]',
  };
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
