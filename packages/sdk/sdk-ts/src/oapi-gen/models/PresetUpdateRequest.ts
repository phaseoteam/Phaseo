export interface PresetUpdateRequest {
  config?: {
    prompt?: {
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
    };
    [key: string]: unknown;
  };
  description?: string | null;
  name?: string;
  replace_config?: boolean;
  slug?: string;
  versioning_method?: "sequential" | "semver" | "date";
  visibility?: "private" | "team" | "public";
}
