export interface AudioTranscriptionRequest {
  audio_b64?: string;
  audio_url?: string;
  language?: string;
  model: string;
}
