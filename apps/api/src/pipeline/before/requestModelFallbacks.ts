// Purpose: Parse and validate the request-level `models` fallback list.
// Why: `models` names ordered models to try; `model`, when set, is tried first.
// Fallbacks reuse the same rerun-the-pipeline machinery as dynamic-route fallbacks.
// How: Validates shape and limits, dedupes, and strips the field before schema
// validation so providers and parameter checks never see it.

import { isAutoRouterModel } from "./auto-router";

/** Maximum `models` entries per request. Dynamic routes keep their own limit. */
export const MAX_REQUEST_MODEL_FALLBACKS = 25;
export const REQUEST_MODEL_FALLBACKS_FIELD = "models";

export type RequestModelFallbackParseResult =
	| { ok: true; primary: string | null; fallbacks: string[]; requested: string[] | null }
	| { ok: false; reason: string; message: string };

export function hasRequestModelFallbacksField(body: unknown): boolean {
	return Boolean(
		body &&
		typeof body === "object" &&
		!Array.isArray(body) &&
		Object.prototype.hasOwnProperty.call(body, REQUEST_MODEL_FALLBACKS_FIELD) &&
		(body as Record<string, unknown>)[REQUEST_MODEL_FALLBACKS_FIELD] !== undefined,
	);
}

/**
 * Returns the primary model and ordered fallbacks for a request. `model` is
 * tried first when present; otherwise the first `models` entry is the primary.
 * Repeated entries and entries equal to the primary are dropped. A request
 * without `models` returns no fallbacks.
 */
export function parseRequestModelFallbacks(body: unknown): RequestModelFallbackParseResult {
	if (!hasRequestModelFallbacksField(body)) return { ok: true, primary: null, fallbacks: [], requested: null };
	const record = body as Record<string, unknown>;
	const raw = record[REQUEST_MODEL_FALLBACKS_FIELD];
	if (raw === null) return { ok: true, primary: null, fallbacks: [], requested: null };
	if (!Array.isArray(raw)) {
		return { ok: false, reason: "invalid_models", message: "models must be an array of model IDs" };
	}
	if (raw.length === 0) {
		return { ok: false, reason: "invalid_models", message: "models must contain at least one model ID" };
	}
	if (raw.length > MAX_REQUEST_MODEL_FALLBACKS) {
		return {
			ok: false,
			reason: "too_many_models",
			message: `models accepts at most ${MAX_REQUEST_MODEL_FALLBACKS} model IDs`,
		};
	}
	const requested: string[] = [];
	for (const value of raw) {
		if (typeof value !== "string" || !value.trim()) {
			return { ok: false, reason: "invalid_models", message: "Each models entry must be a non-empty model ID string" };
		}
		requested.push(value.trim());
	}
	const explicitModel = typeof record.model === "string" ? record.model.trim() : record.model;
	if (explicitModel !== undefined && explicitModel !== null && explicitModel !== "" && typeof explicitModel !== "string") {
		// Leave an invalid `model` for schema validation to reject.
		return { ok: true, primary: null, fallbacks: [...new Set(requested)], requested };
	}
	const primary = typeof explicitModel === "string" && explicitModel ? explicitModel : requested[0]!;
	if (isAutoRouterModel(primary)) {
		return {
			ok: false,
			reason: "models_not_supported_with_auto_router",
			message: "phaseo/auto manages its own ranked fallbacks; remove models or choose a fixed primary model",
		};
	}
	if (requested.some((model) => isAutoRouterModel(model))) {
		return {
			ok: false,
			reason: "auto_router_not_allowed_in_models",
			message: "models entries must be fixed model IDs or presets; phaseo/auto cannot be a fallback",
		};
	}
	const fallbacks = [...new Set(requested)].filter((model) => model !== primary);
	return { ok: true, primary, fallbacks, requested };
}

export function withoutRequestModelFallbacks<T>(body: T): T {
	if (!body || typeof body !== "object" || Array.isArray(body) || !(REQUEST_MODEL_FALLBACKS_FIELD in body)) {
		return body;
	}
	const { [REQUEST_MODEL_FALLBACKS_FIELD]: _models, ...rest } = body as Record<string, unknown>;
	return rest as T;
}
