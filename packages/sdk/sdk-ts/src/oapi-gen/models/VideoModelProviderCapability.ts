export interface VideoModelProviderCapability {
  id?: string;
  parameter_specs?: {
    [key: string]: {
      alias_of?: string;
      aliases?: string[];
      always_on?: boolean;
      default?: string | number | boolean;
      dimensions?: {
        aspect_ratios?: string[];
        max?: number;
        max_aspect_ratio?: string;
        max_height?: number;
        max_pixels?: number;
        max_width?: number;
        min?: number;
        min_pixels?: number;
        multiple_of?: number;
      };
      extra?: {
        [key: string]: unknown;
      };
      format?: string;
      formats?: string[];
      item_types?: string[];
      max?: number;
      max_file_size_bytes?: number;
      max_items?: number;
      max_length?: number;
      max_tokens?: number;
      media?: "image" | "audio" | "video";
      min?: number;
      min_items?: number;
      min_length?: number;
      multiple_of?: number;
      notes?: string;
      open?: boolean;
      options?: {
        description?: string;
        label?: string;
        value: string | number | boolean;
        [key: string]: unknown;
      }[];
      properties?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      provider_default?: string | number | boolean;
      required?: boolean;
      requires?: string[];
      source?: {
        url?: string;
        verified_at?: string;
      };
      step?: number;
      support_level?: string;
      supported: boolean;
      type?:
        | "string"
        | "integer"
        | "number"
        | "boolean"
        | "array"
        | "object"
        | "file"
        | (
            | "string"
            | "integer"
            | "number"
            | "boolean"
            | "array"
            | "object"
            | "file"
          )[];
      upstream_name?: string;
      upstream_values?: (string | number | boolean)[];
      values?: (string | number | boolean)[];
      when?: {
        default?: string | number | boolean;
        if: {
          [key: string]: (string | number | boolean)[];
        };
        max?: number;
        message?: string;
        min?: number;
        step?: number;
        supported?: boolean;
        values?: (string | number | boolean)[];
      }[];
    };
  };
  supported_parameters?: string[];
  supported_parameters_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
  supported_params?: string[];
  supported_params_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
}
