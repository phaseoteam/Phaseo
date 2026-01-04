export interface AudioSpeechRequest {
  format?: "mp3" | "wav" | "ogg" | "aac";
  input: string;
  model: string;
  voice?: string;
}
