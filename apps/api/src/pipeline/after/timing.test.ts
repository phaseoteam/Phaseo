import { describe, expect, it } from "vitest";
import type { PipelineContext } from "../before/types";
import {
	buildResponseTimeline,
	resolveBeforeLatencyMs,
	resolveExecuteTotalLatencyMs,
	resolveNonStreamLatencyMs,
} from "./timing";

function buildContext(overrides?: Partial<PipelineContext>): PipelineContext {
	return {
		endpoint: "chat.completions",
		capability: "text.generate",
		requestId: "req_timing_test",
		meta: {
			apiKeyId: "key_test",
			apiKeyRef: "kid_test",
			apiKeyKid: "kid_test",
			requestId: "req_timing_test",
		},
		rawBody: {},
		body: {},
		model: "openai/gpt-5.4-nano",
		workspaceId: "team_test",
		stream: false,
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
		...overrides,
	} as PipelineContext;
}

describe("after timing helpers", () => {
	it.each(["hit", "miss", "bypass", "credit_refresh"] as const)("records the actual context cache state (%s)", (status) => {
		const ctx = buildContext();
		ctx.meta.beforeContextCacheStatus = status;
		ctx.meta.timeToUpstreamRequestMs = 42;
		expect(buildResponseTimeline(ctx)).toMatchObject({ routing_ms: 42, context_cache_status: status });
	});

	it("omits unknown cache diagnostics and keeps missing dispatch time unknown", () => {
		const ctx = buildContext();
		ctx.meta.beforeContextCacheStatus = "private-diagnostic" as never;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: null });
		ctx.meta.beforeContextCacheStatus = "hit";
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: null, context_cache_status: "hit" });
	});

	it("does not throw while reporting an error with only a partial request context", () => {
		expect(buildResponseTimeline({ requestId: "early-failure" } as PipelineContext)).toEqual({ version: 1, routing_ms: null });
	});
	it("records the dispatch boundary for deduplicating retry preparation", () => {
		const ctx = buildContext();
		ctx.meta.startedAtMs = 1000;
		ctx.meta.timeToUpstreamRequestMs = 20;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: 20, first_dispatch_at_ms: 1020 });
	});

	it.each([0, 12.6])("records first-dispatch routing time (%s)", (value) => {
		const ctx = buildContext();
		ctx.meta.timeToUpstreamRequestMs = value;
		ctx.meta.timeToLatestUpstreamRequestMs = 5000;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: Math.round(value) });
	});

	it.each([undefined, -1, NaN, Infinity])("does not fabricate missing or invalid routing time (%s)", (value) => {
		const ctx = buildContext();
		ctx.meta.timeToUpstreamRequestMs = value;
		ctx.meta.before_ms = 12;
		ctx.meta.generation_ms = 400;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: null });
		expect(buildResponseTimeline(null)).toEqual({ version: 1, routing_ms: null });
	});

	it("prefers explicit latency from request meta", () => {
		const ctx = buildContext({
			meta: {
				apiKeyId: "key_test",
				apiKeyRef: "kid_test",
				apiKeyKid: "kid_test",
				requestId: "req_timing_test",
				latency_ms: 42,
			},
		});

		expect(resolveNonStreamLatencyMs(ctx, 80)).toBe(42);
	});

	it("does not fabricate provider latency from gateway stage timings", () => {
		const ctx = buildContext({
			meta: {
				apiKeyId: "key_test",
				apiKeyRef: "kid_test",
				apiKeyKid: "kid_test",
				requestId: "req_timing_test",
				before_ms: 12,
			},
			timing: {
				execute: {
					total_ms: 34,
				},
			} as any,
		});

		expect(resolveBeforeLatencyMs(ctx)).toBe(12);
		expect(resolveExecuteTotalLatencyMs(ctx)).toBe(34);
		expect(resolveNonStreamLatencyMs(ctx, 99)).toBeNull();
	});

	it("does not use generation duration as first-frame latency", () => {
		const ctx = buildContext({
			timing: {
				before: {
					total_ms: 8,
				},
			} as any,
		});

		expect(resolveNonStreamLatencyMs(ctx, 25)).toBeNull();
	});
});
