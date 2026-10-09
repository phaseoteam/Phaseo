/**
 * Phaseo extension for video-capable decision models such as Clef Omni. Supply a public HTTPS URL or an inline video data URL. OpenAI decision models do not support this extension.
 */
export interface DecisionInputVideo {
  type: "input_video";
  video_url:
    | string
    | {
        url: string;
      };
}
