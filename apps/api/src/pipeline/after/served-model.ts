// Purpose: Name the Phaseo model that served a request on every client payload and stream frame.
// Why: Providers echo their own model id (`gpt-6-luna`, `claude-sonnet-5-5`,
// `deepseek-ai/DeepSeek-V4.1-Flash-1017`), and stream frames passed through from
// the provider carried that echo to clients while buffered Responses bodies named
// the Phaseo id. After a model fallback the echo also reads as the primary model
// having answered; the routing docs promise `model` names the model that served it.
// How: Replaces `model` on client payloads and stream frames with the Phaseo id the
// request resolved to (the selected model for `phaseo/auto`, the fallback model
// after a fallback). Internal readers (usage, logs, billing) read the source frames
// and `ctx.model`, so this only changes what the client sees.

import type { PipelineContext } from "../before/types";

type ServedModelContext = Pick<PipelineContext, "model"> & { routingDiagnostics?: Record<string, any> | null };

/**
 * The model id clients should see, or null to keep the payload's own value.
 * A Phaseo id has an organisation prefix (`openai/gpt-6-luna`); a bare context
 * model is not one, so the payload keeps its value unless a fallback served it.
 */
export function clientModelId(ctx: ServedModelContext): string | null {
	if (typeof ctx.model !== "string" || ctx.model.length === 0) return null;
	if (ctx.routingDiagnostics?.modelFallback || ctx.model.includes("/")) return ctx.model;
	return null;
}

/**
 * Sets `model` on a buffered payload or a stream frame (Chat chunk, Responses
 * event with `response`, Messages `message_start`). Returns the payload; nested
 * objects are copied, not mutated.
 */
export function withServedModel<T>(payload: T, ctx: ServedModelContext): T {
	const model = clientModelId(ctx);
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
