export interface AudioTranslationRequest {
  audio_b64?: string;
  audio_url?: string;
  language?: string;
  model: string;
  prompt?: string;
  temperature?: number;
}
