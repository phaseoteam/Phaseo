/**
 * Responses API input item.
 */
export interface ResponsesInputItem {
  content?: string | {}[] | {};
  role?: "user" | "assistant" | "system" | "developer";
  type?: string;
}
