export interface ToolCallContentPart {
  function: {
    arguments?: string;
    name?: string;
  };
  id: string;
  type: "tool_call";
}
