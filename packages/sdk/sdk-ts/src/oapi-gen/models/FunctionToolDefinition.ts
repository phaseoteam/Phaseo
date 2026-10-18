export interface FunctionToolDefinition {
  async?: boolean;
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
  function: {
    description?: string;
    name: string;
    parameters: {};
  };
  type: "function";
  [key: string]: unknown;
}
