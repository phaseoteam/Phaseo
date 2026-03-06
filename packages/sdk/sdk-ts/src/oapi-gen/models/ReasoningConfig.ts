export interface ReasoningConfig {
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  enabled?: boolean;
  max_tokens?: number;
  summary?: "auto" | "concise" | "detailed";
}
