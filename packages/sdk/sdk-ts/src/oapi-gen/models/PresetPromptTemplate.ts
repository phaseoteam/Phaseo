/**
 * Messages with variable placeholders that the gateway fills in for each request, and the variables they take.
 */
export interface PresetPromptTemplate {
  messages: {
    content:
      | string
      | {
          name?: string;
          text?: string;
          type: "text" | "variable";
        }[];
    role: "system" | "developer" | "user" | "assistant";
  }[];
  response_format?: {
    [key: string]: unknown;
  };
  syntax?: "mustache-v1";
  tool_choice?: unknown;
  tools?: {
    [key: string]: unknown;
  }[];
  variables?: {
    [key: string]: {
      default?: unknown;
      description?: string;
      enum?: string[];
      max_length?: number;
      required?: boolean;
      type:
        | "string"
        | "number"
        | "boolean"
        | "enum"
        | "array"
        | "object"
        | "any"
        | "image";
    };
  };
}
