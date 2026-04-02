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
    };
