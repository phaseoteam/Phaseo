export interface ChatAudioOutputPart {
  audio_url: {
    url: string;
  };
  format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
  mime_type?: string;
  type: "audio_url";
}
