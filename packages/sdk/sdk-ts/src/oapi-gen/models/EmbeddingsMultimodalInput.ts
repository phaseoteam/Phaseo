/**
 * Google multimodal embeddings extension item.
 */
export interface EmbeddingsMultimodalInput {
  content:
    | {
        text: string;
        type: "text" | "input_text";
      }
    | {
        image_url?:
          | string
          | {
              url: string;
            };
        type: "image_url" | "input_image" | "image";
        url?:
          | string
          | {
              url: string;
            };
      }
    | {
        input_audio: {
          data?: string;
          format?: string;
          url?: string;
        };
        type: "input_audio";
      }
    | {
        type: "input_video" | "video_url";
        url?:
          | string
          | {
              url: string;
            };
        video_url?:
          | string
          | {
              url: string;
            };
      }[];
}
