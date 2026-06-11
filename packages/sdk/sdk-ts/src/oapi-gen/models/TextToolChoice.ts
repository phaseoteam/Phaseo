/**
 * Tool selection strategy. `gateway:datetime`, `ai-stats:web_search`, `ai-stats:web_fetch`, `ai-stats:advisor`, `ai-stats:image_generation`, and `ai-stats:apply_patch` are accepted and rewritten by the gateway into upstream function/tool targets.
 *
 */
export type TextToolChoice =
  | "auto"
  | "none"
  | "required"
  | "gateway:datetime"
  | "ai-stats:web_search"
  | "ai-stats:web_fetch"
  | "ai-stats:advisor"
  | "ai-stats:image_generation"
  | "ai-stats:apply_patch"
  | {};
