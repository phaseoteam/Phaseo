/**
 * Responses API input item.
 */
export interface ResponsesInputItem {
  content?: string | {}[] | {};
  encrypted_content?: string;
  id?: string;
  role?: "user" | "assistant" | "system" | "developer";
  summary?: {
    text: string;
    type: "summary_text";
  }[];
  type?: string;
}
