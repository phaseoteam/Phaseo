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
      allowed_domains?: string[];
      engine?: "auto" | "exa";
      excluded_domains?: string[];
      include_highlights?: boolean;
      include_text?: boolean;
      max_results?: number;
      max_total_results?: number;
      parameters?: {
        allowed_domains?: string[];
        engine?: "auto" | "exa";
        excluded_domains?: string[];
        include_highlights?: boolean;
        include_text?: boolean;
        max_results?: number;
        max_total_results?: number;
        search_context_size?: "low" | "medium" | "high";
      };
      search_context_size?: "low" | "medium" | "high";
      type: "gateway:web_search";
    }
  | {
      allowed_domains?: string[];
      excluded_domains?: string[];
      max_chars?: number;
      parameters?: {
        allowed_domains?: string[];
        excluded_domains?: string[];
        max_chars?: number;
      };
      type: "gateway:web_fetch";
    }
  | {
      parameters?: {};
      type: "gateway:apply_patch";
    }
  | {
      model?: string;
      parameters?: {
        background?: string;
        model?: string;
        n?: number;
        output_format?: string;
        quality?: string;
        response_format?: string;
        size?: string;
      };
      type: "gateway:image_generation";
    }
  | {
      analysis_models?: string[];
      include_web?: boolean;
      model?: string;
      parameters?: {
        analysis_models?: string[];
        include_web?: boolean;
        model?: string;
      };
      type: "gateway:fusion";
    }
  | {
      parameters?: {};
      type: "gateway:tool_search";
    };
