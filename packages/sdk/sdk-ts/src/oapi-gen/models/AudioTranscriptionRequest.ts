export interface AudioTranscriptionRequest {
  audio_b64?: string;
  audio_url?: string;
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
}
