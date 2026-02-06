export type ResponsesInputItem =
  | {
      cache_control?: {
        cache?: {
          ttl?: "5m" | "1h";
          type?: "ehpemeral" | "ephemeral";
        };
        ttl?: "5m" | "1h";
        type?: "ehpemeral" | "ephemeral";
      };
      text: string;
      type: "input_text";
    }
  | {
      detail?: "auto" | "low" | "high";
      image_url:
        | string
        | {
            url?: string;
          };
      type: "input_image";
    }
  | {
      input_audio: {
        data?: string;
        format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
      };
      type: "input_audio";
    }
  | {
      type: "input_video";
      video_url: string;
    }
  | {
      content:
        | string
        | {
            cache_control?: {
              cache?: {
                ttl?: "5m" | "1h";
                type?: "ehpemeral" | "ephemeral";
              };
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            text: string;
            type: "text";
          }
        | {
            cache_control?: {
              cache?: {
                ttl?: "5m" | "1h";
                type?: "ehpemeral" | "ephemeral";
              };
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            text: string;
            type: "input_text";
          }
        | {
            image_url: {
              url?: string;
            };
            type: "image_url";
          }
        | {
            image_url:
              | string
              | {
                  url?: string;
                };
            type: "input_image";
          }
        | {
            input_audio: {
              data?: string;
              format?:
                | "wav"
                | "mp3"
                | "flac"
                | "m4a"
                | "ogg"
                | "pcm16"
                | "pcm24";
            };
            type: "input_audio";
          }
        | {
            type: "input_video";
            video_url: string;
          }
        | {
            function: {
              arguments?: string;
              name?: string;
            };
            id: string;
            type: "tool_call";
          }[];
      role: "system" | "developer" | "user" | "assistant" | "tool";
      tool_call_id?: string;
      tool_calls?: {
        function: {
          arguments?: string;
          description?: string;
          name?: string;
          parameters?: {};
        };
        id: string;
        type: "function";
      }[];
      type: "message";
    }
  | {
      arguments: string;
      call_id?: string;
      name: string;
      type: "function_call";
    }
  | {
      call_id: string;
      output: string;
      type: "function_call_output";
    };
