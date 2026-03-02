/**
 * Responses API output item. Assistant message items may include `phase` as `commentary` (intermediate) or `final_answer` (final).
 *
 */
export interface ResponsesOutputItem {
  content?: {}[];
  phase?: "commentary" | "final_answer" | null;
  role?: string;
  type?: string;
}
