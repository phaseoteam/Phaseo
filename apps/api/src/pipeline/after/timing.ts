import type { PipelineContext } from "../before/types";

function readTimingMetric(ctx: PipelineContext, key: string): number | null {
	const timing = (ctx as any)?.timing;
	if (!timing || typeof timing !== "object") return null;
	const value = timing[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveBeforeLatencyMs(ctx: PipelineContext): number {
	const fromMeta = ctx.meta.before_ms;
	if (typeof fromMeta === "number" && Number.isFinite(fromMeta)) return fromMeta;

	const nested = (ctx as any)?.timing?.before?.total_ms;
	if (typeof nested === "number" && Number.isFinite(nested)) return nested;

	return readTimingMetric(ctx, "before_start") ?? 0;
}

export function resolveExecuteTotalLatencyMs(ctx: PipelineContext): number | null {
	const nested = (ctx as any)?.timing?.execute?.total_ms;
	if (typeof nested === "number" && Number.isFinite(nested)) return nested;

	return readTimingMetric(ctx, "adapter_start");
}

export function resolveNonStreamLatencyMs(
	ctx: PipelineContext,
	generationMs: number | null | undefined,
): number | null {
	if (typeof ctx.meta.latency_ms === "number" && Number.isFinite(ctx.meta.latency_ms)) {
		return ctx.meta.latency_ms;
	}

	const beforeMs = resolveBeforeLatencyMs(ctx);
	const executeMs = resolveExecuteTotalLatencyMs(ctx);
	if (typeof executeMs === "number" && Number.isFinite(executeMs)) {
		return Math.round(beforeMs + executeMs);
	}

	if (typeof generationMs === "number" && Number.isFinite(generationMs)) {
		return Math.round(beforeMs + generationMs);
	}

	return null;
}
