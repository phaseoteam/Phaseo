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
  include?: string[];
  input?:
    | string
    | {
        content?: string | {}[] | {};
        phase?: "commentary" | "final_answer" | null;
        role?: "user" | "assistant" | "system" | "developer";
        type?: string;
      }[]
    | {};
  input_items?: {
    content?: string | {}[] | {};
    phase?: "commentary" | "final_answer" | null;
    role?: "user" | "assistant" | "system" | "developer";
    type?: string;
  }[];
  instructions?: string;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  max_tool_calls?: number;
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: string[];
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
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  provider_options?: {
    openai?: {
      context_management?: {
        compact_threshold?: number;
        type: "compaction";
      };
    };
  };
  providerOptions?: {
    openai?: {
      contextManagement?: {
        compactThreshold?: number;
        type: "compaction";
      };
    };
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: string;
  };
  response_modalities?: string[];
  responseModalities?: string[];
  safety_identifier?: string;
  service_tier?: string;
  speed?: string;
  store?: boolean;
  stream?: boolean;
  stream_options?: {};
  temperature?: number;
  text?: {};
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
  tools?: {}[];
  top_logprobs?: number;
  top_p?: number;
  truncation?: string;
  usage?: boolean;
  user?: string;
}
