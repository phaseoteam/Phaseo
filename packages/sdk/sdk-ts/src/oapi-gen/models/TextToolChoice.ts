/**
 * Tool selection strategy. `gateway:datetime` is accepted and rewritten by the gateway into an upstream function/tool target.
 *
 */
export type TextToolChoice =
  | "auto"
  | "none"
  | "required"
  | "gateway:datetime"
  | {};
