/**
 * Tool selection strategy. `gateway:datetime`, `gateway:web_search`, and `gateway:web_fetch` are accepted and rewritten by the gateway into upstream function/tool targets.
 *
 */
export type TextToolChoice =
  | "auto"
  | "none"
  | "required"
  | "gateway:datetime"
  | "gateway:web_search"
  | "gateway:web_fetch"
  | {};
