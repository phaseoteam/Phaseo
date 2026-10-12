/**
 * Ordered model IDs or presets to try. When `model` is set it is tried first and `models` lists the fallbacks; when `model` is omitted the first entry is tried first. Later entries run in order after a `429`, `500`, `502`, `503`, or `504`. Duplicates and entries equal to the primary model are ignored. Each fallback reruns the full request pipeline, including capability, policy, guardrail, pricing, and BYOK checks, and a fallback that cannot serve the request is skipped. Streaming requests fall back only before the first byte is sent, and asynchronous jobs fall back only at submission. The response, usage, billing, and request logs reflect the model that served the request. `phaseo/auto` cannot be combined with `models`.
 */
export type ModelFallbacks = string[];
