export interface EmbeddingsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  dimensions?: number;
  encoding_format?: "float" | "base64";
  input:
    | string
    | number[]
    | {
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
    | string
    | number[]
    | {
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
      }[];
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  provider_options?: {
    google?: {
      task_type?: string;
      title?: string;
    };
    mistral?: {
      output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
    };
  };
  user?: string;
}
