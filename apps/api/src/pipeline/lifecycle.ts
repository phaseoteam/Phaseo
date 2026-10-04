import type { PipelineContext, ProviderAttemptLog } from "./before/types";

export type LifecycleEvent = {
	sequence: number;
	timestamp_ms: number;
	elapsed_ms: number;
	type: "routing.completed" | "provider.admission" | "provider.rejected" | "provider.started" | "provider.response" | "provider.completed" | "tool.started" | "tool.completed" | "response.ready";
	span_id?: string;
	parent_span_id?: string;
	provider?: string;
	model?: string;
	attempt_number?: number;
	call_kind?: "initial" | "continuation" | "retry" | "nested";
	tool_call_id?: string;
	tool_name?: string;
	status?: number;
	outcome?: string;
};

export type RequestLifecycle = {
	version: 1;
	events: LifecycleEvent[];
	truncated: boolean;
	origin: number;
	sequence: number;
};

/** One shared journal per request, including nested model calls. No payload content. */
export function recordLifecycleEvent(ctx: PipelineContext, input: Omit<LifecycleEvent, "sequence" | "timestamp_ms" | "elapsed_ms">): string {
	const journal = ctx.lifecycle ??= { version: 1, events: [], truncated: false, origin: performance.now(), sequence: 0 };
	const sequence = ++journal.sequence;
	const spanId = input.span_id ?? `event-${sequence}`;
	if (journal.events.length >= 1024) {
		journal.truncated = true;
		return spanId;
	}
	journal.events.push({
		...Object.fromEntries(Object.entries(input).map(([key, value]) => {
			if (typeof value === "string" && value.length > 256) {
				journal.truncated = true;
				return [key, value.slice(0, 256)];
			}
			return [key, value];
		})) as typeof input,
		span_id: spanId,
		...(ctx.lifecycleParentSpanId ? { parent_span_id: ctx.lifecycleParentSpanId } : {}),
		sequence,
		timestamp_ms: Date.now(),
		elapsed_ms: Math.max(0, Math.round(performance.now() - journal.origin)),
	});
	return spanId;
}

export function recordProviderResult(ctx: PipelineContext, entry: ProviderAttemptLog) {
	if (!entry.lifecycle_span_id) return;
	const dispatched = ctx.lifecycle?.events.some((event) => event.span_id === entry.lifecycle_span_id && event.type === "provider.started");
	recordLifecycleEvent(ctx, {
		type: !dispatched ? "provider.rejected" : entry.response_kind === "stream" && entry.outcome === "success" ? "provider.response" : "provider.completed",
		span_id: entry.lifecycle_span_id,
		provider: entry.provider, model: entry.model,
		attempt_number: entry.attempt_number,
		...(entry.status != null ? { status: entry.status } : {}),
		outcome: entry.outcome,
	});
}

export function finishStreamingProvider(ctx: PipelineContext, outcome = "success") {
	const spanId = ctx.lifecycleProviderSpanId;
	if (!spanId || !ctx.lifecycle) return;
	const response = [...ctx.lifecycle.events].reverse().find((event) => event.span_id === spanId && event.type === "provider.response");
	if (!response || ctx.lifecycle.events.some((event) => event.span_id === spanId && event.type === "provider.completed")) return;
	recordLifecycleEvent(ctx, { ...response, type: "provider.completed", outcome });
}

export function retainedLifecycle(ctx: PipelineContext) {
	return ctx.lifecycle ? { version: 1, events: ctx.lifecycle.events, truncated: ctx.lifecycle.truncated } : undefined;
}
