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
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
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
