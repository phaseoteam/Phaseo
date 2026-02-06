import type { LanguageModelV3ToolChoice, LanguageModelV3FunctionTool } from '@ai-sdk/provider';

type ProviderTool = {
  type: 'provider' | 'provider-defined';
  [key: string]: any;
};

/**
 * Converts AI SDK tools to AI Stats Gateway format
 */
export function prepareTools(tools: Array<LanguageModelV3FunctionTool | ProviderTool | any>): any[] {
  return tools.map((tool) => {
    if (tool.type === 'provider' || tool.type === 'provider-defined') {
      // For provider-defined tools, we just pass through the configuration
      return tool;
    }
    // For function tools
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters, // Already JSON Schema format
      },
    };
  });
}

/**
 * Converts AI SDK tool choice to gateway format
 */
export function convertToolChoice(toolChoice: LanguageModelV3ToolChoice | any): any {
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
