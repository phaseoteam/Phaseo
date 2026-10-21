export interface ReasoningConfig {
  effort?:
    "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null;
  enabled?: boolean;
  max_tokens?: number;
  mode?: "standard" | "pro";
  summary?: "auto" | "concise" | "detailed";
}
