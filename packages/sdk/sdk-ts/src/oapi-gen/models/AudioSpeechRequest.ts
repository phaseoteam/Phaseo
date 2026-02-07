export interface AudioSpeechRequest {
  format?: "mp3" | "wav" | "ogg" | "aac";
  input: string;
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  voice?: string;
}
