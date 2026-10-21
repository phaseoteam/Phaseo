export interface PresetVersionListResponse {
  data: {
    config: {
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
    created_at: string;
    created_by: string;
    description?: string | null;
    id: string;
    name: string;
    preset_id: string;
    release_notes?: string | null;
    slug: string;
    version_label: string;
    version_number: number;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
  }[];
}
