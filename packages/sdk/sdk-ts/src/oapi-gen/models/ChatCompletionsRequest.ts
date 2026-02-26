export interface ChatCompletionsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  frequency_penalty?: number;
  image_config?: {
    aspect_ratio?: string;
    aspectRatio?: string;
    font_inputs?: {
      font_url?: string;
      text?: string;
    }[];
    fontInputs?: {
      fontUrl?: string;
      text?: string;
    }[];
    image_size?: "0.5K" | "1K" | "2K" | "4K";
    imageSize?: "0.5K" | "1K" | "2K" | "4K";
    include_rai_reason?: boolean;
    includeRaiReason?: boolean;
    reference_images?: {
      [key: string]: unknown;
    }[];
    referenceImages?: {
      [key: string]: unknown;
    }[];
    super_resolution_references?: string[];
    superResolutionReferences?: string[];
    [key: string]: unknown;
  };
  imageConfig?: {
    aspect_ratio?: string;
    aspectRatio?: string;
    font_inputs?: {
      font_url?: string;
      text?: string;
    }[];
    fontInputs?: {
      fontUrl?: string;
      text?: string;
    }[];
    image_size?: "0.5K" | "1K" | "2K" | "4K";
    imageSize?: "0.5K" | "1K" | "2K" | "4K";
    include_rai_reason?: boolean;
    includeRaiReason?: boolean;
    reference_images?: {
      [key: string]: unknown;
    }[];
    referenceImages?: {
      [key: string]: unknown;
    }[];
    super_resolution_references?: string[];
    superResolutionReferences?: string[];
    [key: string]: unknown;
  };
  logit_bias?: {
    [key: string]: number;
  };
  logprobs?: boolean;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  max_tool_calls?: number;
  messages: {
    content?:
      | string
      | {
          text: string;
          type: "text";
        }
      | {
          image_url: {
            url?: string;
          };
          type: "image_url";
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
  modalities?: string[];
  model: string;
  parallel_tool_calls?: boolean;
  presence_penalty?: number;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    include_thoughts?: boolean;
    includeThoughts?: boolean;
    max_tokens?: number;
    summary?: "auto" | "concise" | "detailed";
  };
  response_format?:
    | string
    | {
        schema?: {};
        type?: string;
      };
  response_modalities?: string[];
  responseModalities?: string[];
  seed?: number;
  service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
  speed?: string;
  stream?: boolean;
  stream_options?: {};
  system?: string;
  temperature?: number;
  thinking?: {
    budget_tokens?: number;
    budgetTokens?: number;
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
    enabled?: boolean;
    include_thoughts?: boolean;
    includeThoughts?: boolean;
    max_tokens?: number;
    maxTokens?: number;
    type?: "enabled" | "disabled" | "adaptive";
  };
  tool_choice?: string | {};
  tools?: {
    type?: "function";
  }[];
  top_k?: number;
  top_logprobs?: number;
  top_p?: number;
  usage?: boolean;
  user?: string;
  user_id?: string;
}
