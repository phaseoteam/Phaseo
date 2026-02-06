export interface ChatCompletionsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  frequency_penalty?: number;
  logit_bias?: {
    [key: string]: number;
  };
  logprobs?: boolean;
  max_output_tokens?: number;
  max_tool_calls?: number;
  messages: {
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
  modalities?: "text" | "image" | "audio" | "video"[];
  model: string;
  parallel_tool_calls?: boolean;
  presence_penalty?: number;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: "auto" | "concise" | "detailed";
  };
  response_format?:
    | string
    | {
        schema?: {};
        type?: string;
      };
  seed?: number;
  service_tier?: "flex" | "standard" | "priority";
  stream?: boolean;
  system?: string;
  temperature?: number;
  tool_choice?: string | {};
  tools?: {
    type?: "function";
  }[];
  top_k?: number;
  top_logprobs?: number;
  top_p?: number;
  usage?: boolean;
  user_id?: string;
}
