export interface PresetListResponse {
  data: {
    active_version_id?: string | null;
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
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  }[];
  total_count: number;
}
