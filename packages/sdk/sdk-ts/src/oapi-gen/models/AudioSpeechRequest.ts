export interface AudioSpeechRequest {
  format?: "mp3" | "wav" | "ogg" | "aac";
  input: string;
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  voice?: string;
}
