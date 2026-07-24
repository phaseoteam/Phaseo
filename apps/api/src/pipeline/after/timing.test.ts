import { describe, expect, it } from "vitest";
import type { PipelineContext } from "../before/types";
import {
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
