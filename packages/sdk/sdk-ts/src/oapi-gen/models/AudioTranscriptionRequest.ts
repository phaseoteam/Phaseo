export interface AudioTranscriptionRequest {
  audio_b64?: string;
  audio_url?: string;
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
}
