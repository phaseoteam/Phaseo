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
      type: "gateway:web_search";
    }
  | {
      max_chars?: number;
      parameters?: {
        max_chars?: number;
      };
      type: "gateway:web_fetch";
    };
