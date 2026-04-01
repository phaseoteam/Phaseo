export interface FunctionToolDefinition {
  function: {
    description?: string;
    name: string;
    parameters: {};
  };
  type: "function";
  [key: string]: unknown;
}
