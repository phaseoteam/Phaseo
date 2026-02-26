export interface ThinkingConfig {
  budget_tokens?: number;
  budgetTokens?: number;
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  enabled?: boolean;
  include_thoughts?: boolean;
  includeThoughts?: boolean;
  max_tokens?: number;
  maxTokens?: number;
  type?: "enabled" | "disabled" | "adaptive";
}
