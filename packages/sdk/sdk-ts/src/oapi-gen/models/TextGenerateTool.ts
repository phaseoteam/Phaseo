export type TextGenerateTool =
  | {
      function: {
        description?: string;
        name: string;
        parameters: {};
      };
      type: "function";
      [key: string]: unknown;
    }
  | {
      parameters?: {
        timezone?: string;
      };
      timezone?: string;
      type: "gateway:datetime";
    }
  | {
      include_highlights?: boolean;
      include_text?: boolean;
      max_results?: number;
      parameters?: {
        include_highlights?: boolean;
        include_text?: boolean;
        max_results?: number;
      };
      type: "ai-stats:web_search";
    }
  | {
      max_chars?: number;
      parameters?: {
        max_chars?: number;
      };
      type: "ai-stats:web_fetch";
    }
  | {
      forward_transcript?: boolean;
      instructions?: string;
      max_completion_tokens?: number;
      max_tokens?: number;
      max_uses?: number;
      model?: string;
      name?: string;
      parameters?: {
        forward_transcript?: boolean;
        instructions?: string;
        max_completion_tokens?: number;
        max_tokens?: number;
        max_uses?: number;
        model?: string;
        name?: string;
        reasoning?: {
          [key: string]: unknown;
        };
        temperature?: number;
      };
      reasoning?: {
        [key: string]: unknown;
      };
      temperature?: number;
      type: "ai-stats:advisor";
    }
  | {
      aspect_ratio?: string;
      background?: string;
      description?: string;
      model?: string;
      moderation?: string;
      output_compression?: number;
      output_format?: string;
      parameters?: {
        aspect_ratio?: string;
        background?: string;
        description?: string;
        model?: string;
        moderation?: string;
        output_compression?: number;
        output_format?: string;
        prompt?: string;
        quality?: string;
        size?: string;
      };
      prompt?: string;
      quality?: string;
      size?: string;
      type: "ai-stats:image_generation";
    }
  | {
      type: "ai-stats:apply_patch";
    };
