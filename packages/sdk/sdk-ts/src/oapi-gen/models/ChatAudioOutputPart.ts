export interface ChatAudioOutputPart {
  audio_url: {
    url: string;
  };
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
  format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
  mime_type?: string;
  prompt_cache_breakpoint?: {
    mode?: "explicit";
    [key: string]: unknown;
  };
  type: "audio_url";
}
