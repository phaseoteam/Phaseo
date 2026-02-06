/**
 * Anthropic Messages SSE events (message_start, content_block_start, content_block_delta,
 * content_block_stop, message_delta, message_stop). Wire format is `event: <event>\ndata: <json>\n\n`.
 *
 */
export type AnthropicMessagesStreamEvent =
  | {
      data?: {
        message?: {
          content?: {
            cache_control?: {
              cache?: {
                ttl?: "5m" | "1h";
                type?: "ehpemeral" | "ephemeral";
              };
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            content?: string;
            id?: string;
            image_url?:
              | string
              | {
                  url?: string;
                };
            input?: {};
            input_audio?: {
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
            name?: string;
            source?: {
              data?: string;
              media_type?: string;
              type?: string;
              url?: string;
            };
            text?: string;
            tool_use_id?: string;
            type?:
              | "text"
              | "input_text"
              | "image"
              | "input_image"
              | "input_audio"
              | "input_video"
              | "tool_use"
              | "tool_result";
            video_url?: string;
          }[];
          id?: string;
          model?: string;
          role?: string;
          stop_reason?: string;
          stop_sequence?: string;
          type?: string;
          usage?: {
            cache_creation?: {};
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            input_tokens?: number;
            output_tokens?: number;
            server_tool_use?: boolean;
            service_tier?: string;
          };
        };
        [key: string]: unknown;
      };
      event?: "message_start";
    }
  | {
      data?: {
        content_block?: {
          cache_control?: {
            cache?: {
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            ttl?: "5m" | "1h";
            type?: "ehpemeral" | "ephemeral";
          };
          content?: string;
          id?: string;
          image_url?:
            | string
            | {
                url?: string;
              };
          input?: {};
          input_audio?: {
            data?: string;
            format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
          };
          name?: string;
          source?: {
            data?: string;
            media_type?: string;
            type?: string;
            url?: string;
          };
          text?: string;
          tool_use_id?: string;
          type?:
            | "text"
            | "input_text"
            | "image"
            | "input_image"
            | "input_audio"
            | "input_video"
            | "tool_use"
            | "tool_result";
          video_url?: string;
        };
        index?: number;
        [key: string]: unknown;
      };
      event?: "content_block_start";
    }
  | {
      data?: {
        delta?: {
          [key: string]: unknown;
        };
        index?: number;
        [key: string]: unknown;
      };
      event?: "content_block_delta";
    }
  | {
      data?: {
        index?: number;
        [key: string]: unknown;
      };
      event?: "content_block_stop";
    }
  | {
      data?: {
        delta?: {
          [key: string]: unknown;
        };
        usage?: {
          cache_creation?: {};
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          input_tokens?: number;
          output_tokens?: number;
          server_tool_use?: boolean;
          service_tier?: string;
        };
        [key: string]: unknown;
      };
      event?: "message_delta";
    }
  | {
      data?: {
        [key: string]: unknown;
      };
      event?: "message_stop";
    };
