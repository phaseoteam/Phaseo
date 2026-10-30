export interface PresetPromptVariable {
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
}
