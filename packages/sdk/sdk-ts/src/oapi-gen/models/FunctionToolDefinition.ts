export interface FunctionToolDefinition {
  async?: boolean;
  function: {
    description?: string;
    name: string;
    parameters: {};
  };
  type: "function";
  [key: string]: unknown;
}
