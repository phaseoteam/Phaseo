export interface AudioContentPart {
  input_audio: {
    data?: string;
    format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
  };
  type: "input_audio";
}
