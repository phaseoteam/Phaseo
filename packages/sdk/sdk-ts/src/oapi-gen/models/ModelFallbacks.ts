/**
 * Ordered fallback model IDs or presets tried after `model` when the primary attempt fails with `429`, `500`, `502`, `503`, or `504`. `model` is still required and is always tried first. Duplicates and entries equal to `model` are ignored. Each fallback reruns the full request pipeline, including capability, policy, guardrail, pricing, and BYOK checks, and a fallback that cannot serve the request is skipped. Streaming requests fall back only before the first byte is sent, and asynchronous jobs fall back only at submission. The response, usage, billing, and request logs reflect the model that served the request. `phaseo/auto` cannot be combined with `models`.
 */
export type ModelFallbacks = string[];
