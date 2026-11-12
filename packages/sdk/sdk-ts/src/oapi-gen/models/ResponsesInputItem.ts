/**
 * Responses API input item.
 */
export interface ResponsesInputItem {
  content?: string | {}[] | {};
  encrypted_content?: string;
  format?:
    | "anthropic-claude-v1"
    | "openai-responses-v1"
    | "azure-openai-responses-v1"
    | "xai-responses-v1"
    | "google-gemini-v1";
  id?: string;
  role?: "user" | "assistant" | "system" | "developer";
  signature?: string;
  summary?: {
    text: string;
    type: "summary_text";
  }[];
  type?: string;
}
