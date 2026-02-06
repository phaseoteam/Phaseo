export interface AudioTranscriptionRequest {
  audio_b64?: string;
  audio_url?: string;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
}
