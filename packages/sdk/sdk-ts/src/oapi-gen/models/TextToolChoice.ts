/**
 * Tool selection strategy. Phaseo server-tool types are accepted and rewritten into upstream function/tool targets. An allowed_tools object is sent as is to OpenAI; other providers receive its mode (auto or required), or a forced call when required allows exactly one tool.
 *
 */
export type TextToolChoice =
  | "auto"
  | "none"
  | "required"
  | "phaseo:datetime"
  | "phaseo:web_search"
  | "phaseo:web_fetch"
  | "phaseo:subagent"
  | "phaseo:fusion"
  | "phaseo:search_models"
  | "gateway:datetime"
  | "gateway:web_search"
  | "gateway:web_fetch"
  | {};
