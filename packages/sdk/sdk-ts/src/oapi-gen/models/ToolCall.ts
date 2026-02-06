export interface ToolCall {
  function: {
    arguments?: string;
    description?: string;
    name?: string;
    parameters?: {};
  };
  id: string;
  type: "function";
}
