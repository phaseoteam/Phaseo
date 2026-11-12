/**
 * Tool selection strategy. Phaseo server-tool types are accepted and rewritten into upstream function/tool targets. An allowed_tools object is sent as is to OpenAI, with every tool. Other providers are sent only the allowed tools and its mode (auto or required), or a forced call when required allows exactly one tool. If allowed_tools lists a tool that tools does not define, only OpenAI can serve the request; otherwise it returns a 400 error.
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
