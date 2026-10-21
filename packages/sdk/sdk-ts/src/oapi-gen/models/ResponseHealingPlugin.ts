/**
 * Repairs malformed JSON in buffered responses that requested `json_object` or `json_schema` output. Skipped on streams.
 *
 */
export interface ResponseHealingPlugin {
  enabled?: boolean;
  id: "response-healing";
  mode?: "safe" | "strict";
}
