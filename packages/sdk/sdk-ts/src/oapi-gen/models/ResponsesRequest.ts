export interface ResponsesRequest {
  background?: boolean;
  conversation?: string | {};
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  include?: string[];
  input?:
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
      }[]
    | {};
  input_items?:
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
      }[];
  instructions?: string;
  max_output_tokens?: number;
  max_tool_calls?: number;
  max_tools_calls?: number;
  messages?: {
    content?:
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
            format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
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
    name?: string;
    reasoning_content?: string;
    role: "system" | "user" | "assistant" | "tool";
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
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: "text" | "image" | "audio" | "video"[];
  model: string;
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
  prompt?: {
    id?: string;
    variables?: {};
    version?: string;
  };
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: string;
  };
  safety_identifier?: string;
  service_tier?: string;
  store?: boolean;
  stream?: boolean;
  stream_options?: {};
  temperature?: number;
  text?: {};
  tool_choice?: string | {};
  tools?: {}[];
  top_logprobs?: number;
  top_p?: number;
  truncation?: string;
  user?: string;
}
