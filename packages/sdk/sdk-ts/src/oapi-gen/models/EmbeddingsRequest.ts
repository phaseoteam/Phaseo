export interface EmbeddingsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  dimensions?: number;
  encoding_format?: "float" | "base64";
  input:
    | string
    | number[]
    | {
        content:
          | {
              text: string;
              type: "text" | "input_text";
            }
          | {
              image_url?:
                | string
                | {
                    url: string;
                  };
              type: "image_url" | "input_image" | "image";
              url?:
                | string
                | {
                    url: string;
                  };
            }
          | {
              input_audio: {
                data?: string;
                format?: string;
                url?: string;
              };
              type: "input_audio";
            }
          | {
              type: "input_video" | "video_url";
              url?:
                | string
                | {
                    url: string;
                  };
              video_url?:
                | string
                | {
                    url: string;
                  };
            }[];
      }
    | string
    | number[]
    | {
        content:
          | {
              text: string;
              type: "text" | "input_text";
            }
          | {
              image_url?:
                | string
                | {
                    url: string;
                  };
              type: "image_url" | "input_image" | "image";
              url?:
                | string
                | {
                    url: string;
                  };
            }
          | {
              input_audio: {
                data?: string;
                format?: string;
                url?: string;
              };
              type: "input_audio";
            }
          | {
              type: "input_video" | "video_url";
              url?:
                | string
                | {
                    url: string;
                  };
              video_url?:
                | string
                | {
                    url: string;
                  };
            }[];
      }[];
  model: string;
  provider?: {
    allow_fallbacks?: boolean | null;
    data_collection?: "allow" | "deny" | null;
    enforce_distillable_text?: boolean | null;
    ignore?: string[];
    include_alpha?: boolean;
    max_price?: {
      audio?: number | string;
      completion?: number | string;
      image?: number | string;
      prompt?: number | string;
      request?: number | string;
    };
    only?: string[];
    order?: string[];
    preferred_max_latency?:
      | number
      | {
          [key: string]: number;
        };
    preferred_min_throughput?:
      | number
      | {
          [key: string]: number;
        };
    quantizations?: string[] | null;
    require_parameters?: boolean | null;
    require_zero_data_retention?: boolean | null;
    required_data_region?: string | null;
    required_execution_region?: string | null;
    sort?:
      | string
      | {
          [key: string]: unknown;
        };
    zdr?: boolean | null;
  };
  provider_options?: {
    google?: {
      task_type?: string;
      title?: string;
    };
    mistral?: {
      output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
    };
  };
  user?: string;
}
