export interface InteractionStep {
  arguments?:
    | string
    | {
        [key: string]: unknown;
      };
  call_id?: string;
  content?:
    | string
    | {
        data?: string;
        mime_type?: string;
        text?: string;
        type: "text" | "image" | "audio" | "video" | "document";
        uri?: string;
        [key: string]: unknown;
      }[];
  id?: string;
  is_error?: boolean;
  name?: string;
  result?:
    | string
    | {
        [key: string]: unknown;
      };
  signature?: string;
  summary?:
    | string
    | {
        data?: string;
        mime_type?: string;
        text?: string;
        type: "text" | "image" | "audio" | "video" | "document";
        uri?: string;
        [key: string]: unknown;
      };
  type:
    | "user_input"
    | "model_output"
    | "thought"
    | "function_call"
    | "function_result";
  [key: string]: unknown;
}
