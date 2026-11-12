export interface ChatReasoningDetail {
  data?: string;
  format?: string;
  id?: string;
  index?: number;
  signature?: string;
  summary?: string;
  text?: string;
  type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
}
