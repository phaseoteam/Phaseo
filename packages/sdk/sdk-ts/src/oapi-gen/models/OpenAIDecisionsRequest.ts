export interface OpenAIDecisionsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  input:
    | string
    | {
        content:
          | string
          | (
              | {
                  text: string;
                  type: "input_text";
                }
              | {
                  detail?: "low" | "high" | "auto" | "original" | null;
                  image_url: string;
                  type: "input_image";
                }
              | {
                  input_audio:
                    | {
                        data: string;
                        format: "wav" | "mp3";
                      }
                    | {
                        format?: "wav" | "mp3";
                        url: string;
                      };
                  type: "input_audio";
                }
              | {
                  type: "input_video";
                  video_url:
                    | string
                    | {
                        url: string;
                      };
                }
            )[];
        role: "user";
        type?: "message";
      }[];
  meta?: boolean;
  metadata?: {
    [key: string]: unknown;
  };
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
  questions: (
    | {
        instructions: string;
        name?: string;
        type: "predicate";
      }
    | {
        choices: {
          description?: string;
          value: string | boolean;
        }[];
        instructions: string;
        name?: string;
        type: "choice";
      }
    | {
        instructions: string;
        levels: {
          description?: string;
          label: string;
        }[];
        name?: string;
        type: "score";
      }
  )[];
  routing?: {
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
  safety_identifier?: string | null;
}
