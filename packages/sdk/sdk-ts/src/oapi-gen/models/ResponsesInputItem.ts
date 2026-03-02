/**
 * Responses API input item. Assistant messages support `phase`: use `commentary` for intermediate assistant messages and `final_answer` for final assistant messages. On follow-up turns, preserve and resend assistant messages with their original `phase` values.
 *
 */
export interface ResponsesInputItem {
  content?: string | {}[] | {};
  phase?: "commentary" | "final_answer" | null;
  role?: "user" | "assistant" | "system" | "developer";
  type?: string;
}
