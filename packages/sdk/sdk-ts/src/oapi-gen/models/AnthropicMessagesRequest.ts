export interface AnthropicMessagesRequest {
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
  max_tokens?: number;
  messages: {
    content:
      | string
      | {
          content?: string;
          id?: string;
          input?: {};
          name?: string;
          source?: {
            data?: string;
            media_type?: string;
            type?: string;
            url?: string;
          };
          text?: string;
          tool_use_id?: string;
          type?: "text" | "image" | "tool_use" | "tool_result";
        }[];
    role: "user" | "assistant";
  }[];
  metadata?: {
    [key: string]: string;
  };
  modalities?: string[];
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  response_modalities?: string[];
  responseModalities?: string[];
  stream?: boolean;
  system?: string | {}[];
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
    description?: string;
    input_schema?: {};
    name: string;
  }[];
  top_k?: number;
  top_p?: number;
}
