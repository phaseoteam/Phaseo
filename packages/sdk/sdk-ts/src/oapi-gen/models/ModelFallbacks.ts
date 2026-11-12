/**
 * Optional ordered fallback models tried after `model`. `model` is required and is always the primary model. When an attempt fails with `429`, `500`, `502`, `503`, or `504`, the next entry is tried; other errors are returned unchanged. Accepts up to 25 model IDs or presets; duplicates and entries equal to `model` are ignored. Each attempt is validated, logged, and billed as its own request, and the response `model` field and routing trace show the model that served the request. Streaming requests fall back only before the first byte, and video and music jobs fall back only at submission. Batch, realtime, and council requests reject `models`. Fallbacks set on a dynamic route take precedence, and `phaseo/auto` cannot be combined with `models`.
 */
export type ModelFallbacks = string[];
