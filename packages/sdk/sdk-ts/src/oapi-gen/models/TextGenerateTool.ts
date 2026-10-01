export type TextGenerateTool =
  | {
      async?: boolean;
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
      type: "phaseo:datetime" | "gateway:datetime";
    }
  | {
      engine?:
        | "auto"
        | "native"
        | "exa"
        | "firecrawl"
        | "parallel"
        | "perplexity"
        | "tinyfish";
      include_highlights?: boolean;
      include_text?: boolean;
      language?: string;
      max_results?: number;
      page?: number;
      parameters?: {
        engine?:
          | "auto"
          | "native"
          | "exa"
          | "firecrawl"
          | "parallel"
          | "perplexity"
          | "tinyfish";
        include_highlights?: boolean;
        include_text?: boolean;
        language?: string;
        max_results?: number;
        page?: number;
      };
      type: "phaseo:web_search" | "gateway:web_search";
    }
  | {
      max_chars?: number;
      parameters?: {
        max_chars?: number;
      };
      type: "phaseo:web_fetch" | "gateway:web_fetch";
    }
  | {
      parameters?: {
        [key: string]: unknown;
      };
      type: "phaseo:subagent";
    }
  | {
      parameters?: {
        analysis_models: string[];
        model?: string;
        [key: string]: unknown;
      };
      type: "phaseo:fusion";
    }
  | {
      parameters?: {
        max_results?: number;
      };
      type: "phaseo:search_models";
    };
