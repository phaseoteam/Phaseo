import type {
  LanguageModelV3ToolChoice,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
} from '@ai-sdk/provider';

/**
 * Converts AI SDK tools to AI Stats Gateway format
 */
export function prepareTools(
  tools: Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>
): any[] {
  return tools.map((tool) => {
    if (tool.type === 'provider') {
      // Provider tools are gateway/provider-specific and passed through as-is.
      return tool;
    }
    // For function tools
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  });
}

/**
 * Converts AI SDK tool choice to gateway format
 */
export function convertToolChoice(toolChoice: LanguageModelV3ToolChoice): any {
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
