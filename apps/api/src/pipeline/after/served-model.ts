// Purpose: Name the model that served a request after a model fallback.
// Why: The routing docs promise that the response `model` field shows the model
// that served the request. After a fallback the provider's own echo names a
// different model from the one the client asked for, which reads as the
// primary model having answered.
// How: Replaces `model` on client payloads and stream frames with the Phaseo id.

import type { PipelineContext } from "../before/types";

export function servedModelAfterFallback(
	ctx: Pick<PipelineContext, "model"> & { routingDiagnostics?: Record<string, any> | null },
): string | null {
	if (!ctx.routingDiagnostics?.modelFallback) return null;
	return typeof ctx.model === "string" && ctx.model.length > 0 ? ctx.model : null;
}

/**
 * Sets `model` on a buffered payload or a stream frame (Chat chunk, Responses
 * event with `response`, Messages `message_start`). Returns the payload; nested
 * objects are copied, not mutated.
 */
export function withServedModel<T>(
	payload: T,
	ctx: Pick<PipelineContext, "model"> & { routingDiagnostics?: Record<string, any> | null },
): T {
	const model = servedModelAfterFallback(ctx);
	if (!model || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const record = payload as Record<string, any>;
	if (typeof record.model === "string") record.model = model;
	for (const key of ["response", "message"] as const) {
		const nested = record[key];
		if (nested && typeof nested === "object" && typeof nested.model === "string") {
			record[key] = { ...nested, model };
		}
	}
	return payload;
}
