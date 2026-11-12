/**
 * Phaseo extension for audio-capable decision models such as Clef Omni. Supply exactly one of base64 data (with format) or a public HTTPS/inline audio data URL. OpenAI decision models do not support this extension.
 */
export interface DecisionInputAudio {
  input_audio: {
    data?: string;
    format?: "wav" | "mp3";
    url?: string;
  };
  type: "input_audio";
}
