import type {
  LanguageModelV4CallOptions,
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
  LanguageModelV4ReasoningFilePart,
} from '@ai-sdk/provider';
import type { PhaseoModelSettings } from './phaseo-settings.js';
import { prepareTools } from './utils/prepare-tools.js';

/**
 * Converts an AI SDK ProviderV4 prompt into Phaseo's OpenAI-compatible
 * Chat Completions request.
 */
export function convertToGatewayChatRequest(
  prompt: LanguageModelV4Prompt,
  modelId: string,
  settings: PhaseoModelSettings,
  options: LanguageModelV4CallOptions
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
            content: convertContent(
              message.content.filter(
                (part) =>
                  part.type !== 'tool-call' &&
                  part.type !== 'tool-result' &&
                  part.type !== 'reasoning' &&
                  part.type !== 'reasoning-file'
              )
            ),
          };

          const reasoning = message.content
            .filter((part): part is Extract<typeof part, { type: 'reasoning' }> => part.type === 'reasoning')
            .map((part) => part.text)
            .join('');

          if (reasoning) {
            // Phaseo exposes the OpenAI-compatible reasoning_content field.
            assistantMessage.reasoning_content = reasoning;
          }

          const reasoningFiles = message.content.filter(
            (part): part is LanguageModelV4ReasoningFilePart => part.type === 'reasoning-file'
          );
          if (reasoningFiles.length > 0) {
            throw new Error(
              'Phaseo Chat Completions does not accept reasoning-file prompt parts. ' +
                'Remove the reasoning file or provide its useful content as a normal text/image file.'
            );
          }

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
          return message.content.map((part) => {
            if (part.type === 'tool-approval-response') {
              throw new Error(
                'Phaseo Chat Completions does not support ProviderV4 tool approval responses.'
              );
            }

            return {
              role: 'tool',
              tool_call_id: part.toolCallId,
              content: serializeToolOutput(part.output),
            };
          });
      }
    })
    .flat();

  const body: any = {
    model: modelId,
    messages,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) body.max_tokens = options.maxOutputTokens;
  if (options.topP !== undefined) body.top_p = options.topP;
  if (options.topK !== undefined) body.top_k = options.topK;
  if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty;
  if (options.seed !== undefined) body.seed = options.seed;
  if (options.stopSequences?.length) body.stop = options.stopSequences;
  if (options.reasoning && options.reasoning !== 'provider-default') {
    body.reasoning_effort = options.reasoning;
  }

  if (options.tools?.length) {
    body.tools = prepareTools(options.tools);
  }
  // AI SDK passes toolChoice "auto" even without tools; OpenAI rejects tool_choice without tools.
  if (options.toolChoice && body.tools) {
    body.tool_choice = convertToolChoice(options.toolChoice);
  }

  if (options.responseFormat?.type === 'json') {
    if (options.responseFormat.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.responseFormat.name ?? 'response',
          ...(options.responseFormat.description
            ? { description: options.responseFormat.description }
            : {}),
          schema: options.responseFormat.schema,
          strict: true,
        },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
  }

  if (settings.user !== undefined) {
    body.user = settings.user;
  }

  // Phaseo-specific options deliberately win over provider-agnostic values.
  const phaseoOptions = options.providerOptions?.phaseo;
  if (phaseoOptions) {
    Object.assign(body, phaseoOptions);
  }

  return body;
}

function convertContent(content: unknown): string | any[] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const normalized = content.map((part: any) => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'file':
        return convertFilePart(part);
      case 'custom':
        throw new Error(
          `Unsupported Phaseo custom prompt part "${part.kind}". ` +
            'Custom ProviderV4 parts must be implemented by the provider that owns their kind.'
        );
      case 'reasoning':
      case 'reasoning-file':
      case 'tool-call':
      case 'tool-result':
        throw new Error(`Unexpected ${part.type} part in regular message content.`);
      default:
        throw new Error(`Unsupported ProviderV4 prompt part "${String(part.type)}".`);
    }
  });

  if (normalized.length === 0) return '';
  if (normalized.length === 1 && normalized[0].type === 'text') {
    return normalized[0].text;
  }
  return normalized;
}

function convertFilePart(part: LanguageModelV4FilePart): any {
  if (part.data.type === 'text') {
    return { type: 'text', text: part.data.text };
  }

  if (part.data.type === 'reference') {
    throw new Error(
      'Phaseo Chat Completions does not currently support ProviderV4 managed-file references.'
    );
  }

  if (!isImageMediaType(part.mediaType)) {
    throw new Error(
      `Phaseo Chat Completions cannot send inline ${part.mediaType} files. ` +
        'Use inline text for text documents or an image media type.'
    );
  }

  return {
    type: 'image_url',
    image_url: { url: toFileUrl(part.data, part.mediaType) },
  };
}

function isImageMediaType(mediaType: string): boolean {
  return mediaType === 'image' || mediaType === 'image/*' || mediaType.startsWith('image/');
}

function toFileUrl(
  data:
    | { type: 'data'; data: Uint8Array | string }
    | { type: 'url'; url: URL },
  mediaType: string
): string {
  if (data.type === 'url') return String(data.url);
  if (data.data instanceof Uint8Array) {
    return `data:${mediaType};base64,${Buffer.from(data.data).toString('base64')}`;
  }
  return `data:${mediaType};base64,${data.data}`;
}

function serializeToolOutput(output: any): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return String(output.value);
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'execution-denied':
      return JSON.stringify({ type: 'execution-denied', reason: output.reason });
    case 'content':
      return JSON.stringify(
        output.value.map((part: any) => {
          if (part.type === 'text') return { type: 'text', text: part.text };
          if (part.type === 'file' && part.data?.type === 'text') {
            return { type: 'text', text: part.data.text };
          }
          throw new Error(
            `Phaseo Chat Completions cannot serialise ${part.type} tool-result content.`
          );
        })
      );
    default:
      throw new Error(`Unsupported ProviderV4 tool output "${String(output.type)}".`);
  }
}

function convertToolChoice(toolChoice: LanguageModelV4CallOptions['toolChoice']): any {
  switch (toolChoice?.type) {
    case 'auto':
      return 'auto';
    case 'none':
      return 'none';
    case 'required':
      return 'required';
    case 'tool':
      return {
        type: 'function',
        function: { name: toolChoice.toolName },
      };
    default:
      return undefined;
  }
}
