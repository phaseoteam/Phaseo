import { describe, expect, it } from "vitest";
import type { PipelineContext } from "../before/types";
import {
	buildResponseTimeline,
	buildRoutingSteps,
	resolveBeforeLatencyMs,
	resolveExecuteTotalLatencyMs,
	resolveFailoverMs,
	resolveNonStreamLatencyMs,
	recordProviderRound,
	resolveOutputSpeedWindow,
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
	it("records the dispatch boundary for deduplicating retry preparation", () => {
		const ctx = buildContext();
		ctx.meta.startedAtMs = 1000;
		ctx.meta.timeToUpstreamRequestMs = 20;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: 20, failover_ms: null, first_dispatch_at_ms: 1020 });
	});

	it.each([0, 12.6])("records first-dispatch routing time (%s)", (value) => {
		const ctx = buildContext();
		ctx.meta.timeToUpstreamRequestMs = value;
		ctx.meta.timeToLatestUpstreamRequestMs = 5000;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: Math.round(value), failover_ms: null });
	});

	it.each([undefined, -1, NaN, Infinity])("does not fabricate missing or invalid routing time (%s)", (value) => {
		const ctx = buildContext();
		ctx.meta.timeToUpstreamRequestMs = value;
		ctx.meta.before_ms = 12;
		ctx.meta.generation_ms = 400;
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: null, failover_ms: null });
		expect(buildResponseTimeline(null)).toEqual({ version: 1, routing_ms: null, failover_ms: null });
	});

	it("measures failover from the first dispatch to the selected one", () => {
		const ctx = buildContext();
		ctx.meta.startedAtMs = 1000;
		ctx.meta.timeToUpstreamRequestMs = 40;
		ctx.meta.upstreamFetchStartMs = 1040;
		ctx.meta.selectedUpstreamFetchStartMs = 1495.6;
		expect(resolveFailoverMs(ctx)).toBe(456);
		expect(buildResponseTimeline(ctx)).toEqual({ version: 1, routing_ms: 40, failover_ms: 456, first_dispatch_at_ms: 1040 });

		ctx.meta.selectedUpstreamFetchStartMs = 1040;
		expect(resolveFailoverMs(ctx)).toBe(0);
		delete ctx.meta.selectedUpstreamFetchStartMs;
		expect(resolveFailoverMs(ctx)).toBeNull();
		expect(resolveFailoverMs(null)).toBeNull();
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

describe("routing steps", () => {
	it("stores each pre-dispatch step from the timer snapshot, rounded to 0.1 ms, with the context cache status", () => {
		const ctx = buildContext({
			timing: {
				admission: 1.234,
				before_start: 31.26,
				guardAuth: 4.04,
				guardJson: 0.31,
				guardZod: 0.88,
				guardModel: 0.12,
				guardContext: 18.75,
				context_cache_read: 6.5,
				context_rpc: 11.02,
				fetchWorkspacePolicy: 7.9,
				resolveTestingMode: 0.4,
				execute_guard_candidates: 0.2,
				execute_guard_pricing: 0.05,
				execute_rank_providers: 2.36,
				// After dispatch, or not a routing step: never stored.
				adapter_roundtrip_ms: 950,
				ir_encode: 1.5, // response encoding
				after_calculate_pricing: 3,
				internal_latency_ms: 40,
			},
		});
		ctx.meta.beforeContextCacheStatus = "miss";
		expect(buildRoutingSteps(ctx)).toEqual({
			admission: 1.2,
			before: 31.3,
			auth: 4,
			parse: 0.3,
			validate: 0.9,
			model: 0.1,
			context: 18.8,
			context_cache_read: 6.5,
			context_db: 11,
			workspace_policy: 7.9,
			testing_mode: 0.4,
			candidates: 0.2,
			pricing: 0.1,
			ranking: 2.4,
			context_cache: "miss",
		});
	});

	it("adds the steps to the response timeline next to routing_ms", () => {
		const ctx = buildContext({ timing: { guardAuth: 2, guardContext: 5 } });
		ctx.meta.timeToUpstreamRequestMs = 12;
		ctx.meta.beforeContextCacheStatus = "hit";
		expect(buildResponseTimeline(ctx)).toEqual({
			version: 1,
			routing_ms: 12,
			failover_ms: null,
			steps: { auth: 2, context: 5, context_cache: "hit" },
		});
	});

	it("leaves the timeline unchanged when there is no snapshot, and skips invalid durations", () => {
		const ctx = buildContext();
		expect(buildRoutingSteps(ctx)).toBeNull();
		expect(buildResponseTimeline(ctx)).not.toHaveProperty("steps");
		ctx.timing = { guardAuth: Number.NaN, guardContext: -1, adapter_roundtrip_ms: 900 };
		expect(buildRoutingSteps(ctx)).toBeNull();
	});
});

describe("recordProviderRound", () => {
	// The request from 11-02: received at 0, sent to the provider at 1173, first
	// output at 1974, stream read to the end at 2118 (one round, no failover).
	it("times a response read to the end from the selected dispatch, whatever the provider", () => {
		const ctx = buildContext();
		ctx.meta.startedAtMs = 0;
		ctx.meta.upstreamFetchStartMs = 1173;
		ctx.meta.selectedUpstreamFetchStartMs = 1173;
		recordProviderRound(ctx, { completedAtMs: 2118, firstOutputAtMs: 1974 });
		expect(ctx.meta.generation_ms).toBe(945);
		expect(ctx.meta.provider_ttft_ms).toBe(801);
		expect(ctx.meta.latency_ms).toBe(801);
		expect(resolveFailoverMs(ctx)).toBe(0);
	});

	it("adds up server-tool rounds, keeps the first round's TTFT and sums failover per round", () => {
		const ctx = buildContext();
		ctx.meta.startedAtMs = 0;
		// Round 1: a failed attempt at 100, the selected provider at 300, done at 1300.
		ctx.meta.upstreamFetchStartMs = 100;
		ctx.meta.selectedUpstreamFetchStartMs = 300;
		recordProviderRound(ctx, { completedAtMs: 1300, firstOutputAtMs: 700 });
		// Tools run until 1500; round 2 is sent at 1500 and done at 2000.
		ctx.meta.upstreamFetchStartMs = 1500;
		ctx.meta.selectedUpstreamFetchStartMs = 1500;
		recordProviderRound(ctx, { completedAtMs: 2000, firstOutputAtMs: 1600 });
		expect(ctx.meta.generation_ms).toBe(1500);
		expect(ctx.meta.provider_ttft_ms).toBe(400);
		// Only round 1's failed attempt, not the time between rounds.
		expect(resolveFailoverMs(ctx)).toBe(200);
	});

	it("uses a buffered executor's first-output time when no stream was read", () => {
		const ctx = buildContext();
		ctx.meta.selectedUpstreamFetchStartMs = 1000;
		ctx.meta.latency_ms = 250;
		recordProviderRound(ctx, { completedAtMs: 1600 });
		expect(ctx.meta.generation_ms).toBe(600);
		expect(ctx.meta.provider_ttft_ms).toBe(250);
	});

	it("leaves an executor's own figures alone without a dispatch clock", () => {
		const ctx = buildContext();
		ctx.meta.generation_ms = 321;
		recordProviderRound(ctx, { completedAtMs: 5000, firstOutputAtMs: 4000 });
		expect(ctx.meta.generation_ms).toBe(321);
		expect(ctx.meta.provider_ttft_ms).toBeUndefined();
	});

	it("measures a synthetic stream's output speed over the last round only", () => {
		const ctx = buildContext();
		ctx.meta.selectedUpstreamFetchStartMs = 0;
		recordProviderRound(ctx, {
			completedAtMs: 3300,
			firstOutputAtMs: 3200,
			usage: { outputTokens: 15, reasoningTokens: 0 },
		});
		ctx.meta.selectedUpstreamFetchStartMs = 3400;
		recordProviderRound(ctx, {
			completedAtMs: 6200,
			firstOutputAtMs: 6000,
			outputArrivals: 12,
			usage: { outputTokens: 21, reasoningTokens: 0 },
		});
		expect(resolveOutputSpeedWindow(ctx)).toBeUndefined();
		ctx.meta.preserve_stream_timing = true;
		expect(resolveOutputSpeedWindow(ctx)).toEqual({ durationMs: 200, outputTokens: 21, reasoningTokens: 0, arrivals: 12 });
	});

	it("keeps reasoning tokens in the window when the round streamed its reasoning", () => {
		const ctx = buildContext();
		ctx.meta.selectedUpstreamFetchStartMs = 0;
		ctx.meta.preserve_stream_timing = true;
		recordProviderRound(ctx, {
			completedAtMs: 11_200,
			firstOutputAtMs: 200,
			reasoningStreamed: true,
			usage: { outputTokens: 1_000, reasoningTokens: 900 },
		});
		expect(resolveOutputSpeedWindow(ctx)).toEqual({ durationMs: 11_000, outputTokens: 1_000, reasoningTokens: null, arrivals: null });
	});
});
