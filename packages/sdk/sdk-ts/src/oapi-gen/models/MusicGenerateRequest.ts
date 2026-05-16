export interface MusicGenerateRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  duration?: number;
  echo_upstream_request?: boolean;
  elevenlabs?: {
    composition_plan?: {};
    force_instrumental?: boolean;
    model_id?: string;
    music_length_ms?: number;
    output_format?: string;
    prompt?: string;
    sign_with_c2pa?: boolean;
    store_for_inpainting?: boolean;
    with_timestamps?: boolean;
  };
  format?: "mp3" | "wav" | "ogg" | "aac";
  model: string;
  prompt?: string;
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
  suno?: {
    audioWeight?: number;
    callBackUrl?: string;
    customMode?: boolean;
    instrumental?: boolean;
    model?: string;
    negativeTags?: string;
    personaId?: string;
    prompt?: string;
    style?: string;
    styleWeight?: number;
    title?: string;
    vocalGender?: "m" | "f";
    weirdnessConstraint?: number;
  };
}
