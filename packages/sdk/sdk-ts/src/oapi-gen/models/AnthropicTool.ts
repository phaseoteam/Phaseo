export interface AnthropicTool {
  async?: boolean;
  description?: string;
  input_schema?: {};
  name: string;
}
