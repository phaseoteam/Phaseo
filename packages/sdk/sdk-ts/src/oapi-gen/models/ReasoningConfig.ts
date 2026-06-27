export interface ReasoningConfig {
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  enabled?: boolean;
  max_tokens?: number;
  summary?: "auto" | "concise" | "detailed";
}
