export interface AudioTranscriptionRequest {
  audio_b64?: string;
  audio_url?: string;
  chunking_strategy?:
    | "auto"
    | {
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
        threshold?: number;
        type: "server_vad";
      };
  known_speaker_names?: string[];
  known_speaker_references?: string[];
  language?: string;
  model: string;
  models?: string[];
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
}
