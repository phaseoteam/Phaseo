export interface ResponsesOutputAudioPart {
  audio_url?: {
    url?: string;
  };
  b64_json?: string;
  format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
  mime_type?: string;
  type: "output_audio";
}
