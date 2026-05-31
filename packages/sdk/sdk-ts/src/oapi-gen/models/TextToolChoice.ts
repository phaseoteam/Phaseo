/**
 * Tool selection strategy. `gateway:datetime`, `gateway:web_search`, `gateway:web_fetch`, and `gateway:apply_patch` are accepted and rewritten by the gateway into upstream function/tool targets.
 *
 */
export type TextToolChoice =
  | "auto"
  | "none"
  | "required"
  | "gateway:datetime"
  | "gateway:web_search"
  | "gateway:web_fetch"
  | "gateway:apply_patch"
  | {};
