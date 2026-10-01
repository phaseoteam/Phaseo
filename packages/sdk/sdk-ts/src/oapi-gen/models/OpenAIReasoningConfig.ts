export interface OpenAIReasoningConfig {
  effort?:
    | "none"
    | "instant"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";
  enabled?: boolean;
  max_tokens?: number;
  mode?: "standard" | "pro";
  summary?: "auto" | "concise" | "detailed";
}
