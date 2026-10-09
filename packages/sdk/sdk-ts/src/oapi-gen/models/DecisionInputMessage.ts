export interface DecisionInputMessage {
  content:
    | string
    | (
        | {
            text: string;
            type: "input_text";
          }
        | {
            detail?: "low" | "high" | "auto" | "original" | null;
            image_url: string;
            type: "input_image";
          }
        | {
            input_audio:
              | {
                  data: string;
                  format: "wav" | "mp3";
                }
              | {
                  format?: "wav" | "mp3";
                  url: string;
                };
            type: "input_audio";
          }
        | {
            type: "input_video";
            video_url:
              | string
              | {
                  url: string;
                };
          }
      )[];
  role: "user";
  type?: "message";
}
