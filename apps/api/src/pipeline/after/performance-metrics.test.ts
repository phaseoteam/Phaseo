import { describe, expect, it } from "vitest";
import { calculateOutputPerformanceMetrics, getUsageReasoningTokens } from "./performance-metrics";

describe("calculateOutputPerformanceMetrics", () => {
	it("calculates throughput over full provider duration and separates output speed", () => {
		expect(calculateOutputPerformanceMetrics({
			outputTokens: 101,
			providerDurationMs: 2_000,
			providerTtftMs: 500,
			gatewayE2eMs: 2_080,
		})).toEqual({
			effectiveThroughputTps: 50.5,
			outputSpeedTps: 100 / 1.5,
			tpotMs: 15,
			itlMs: null,
			phaseoOverheadMs: 80,
		});
	});

	it("does not invent post-first-token metrics without streaming timing", () => {
		expect(calculateOutputPerformanceMetrics({
			outputTokens: 25,
			providerDurationMs: 1_000,
			providerTtftMs: null,
			gatewayE2eMs: 1_040,
		})).toEqual({
			effectiveThroughputTps: 25,
			outputSpeedTps: null,
			tpotMs: null,
			itlMs: null,
			phaseoOverheadMs: 40,
		});
	});

	it("treats zero TTFT placeholders as missing observations", () => {
		expect(calculateOutputPerformanceMetrics({
			outputTokens: 25,
			providerDurationMs: 1_000,
			providerTtftMs: 0,
			gatewayE2eMs: 1_040,
		})).toEqual({
			effectiveThroughputTps: 25,
			outputSpeedTps: null,
			tpotMs: null,
			itlMs: null,
			phaseoOverheadMs: 40,
		});
	});

	it("counts failed provider attempts as failover, not Phaseo overhead", () => {
		expect(calculateOutputPerformanceMetrics({
			outputTokens: 25,
			providerDurationMs: 1_000,
			providerTtftMs: null,
			gatewayE2eMs: 1_640,
			failoverMs: 600,
		}).phaseoOverheadMs).toBe(40);
	});

	// Live GPT 6 Luna request G-01M6F9RMW1AFGJ2X1D1C4T3119: 85 output tokens, 72 of
	// them reasoning done before the first visible token, 71 ms of visible output.
	it("leaves reasoning done before the first visible token out of output speed", () => {
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 85,
			reasoningTokens: 72,
			providerDurationMs: 1_378,
			providerTtftMs: 1_307,
			gatewayE2eMs: 1_445,
		});
		expect(metrics.tpotMs).toBeCloseTo(71 / 12);
		expect(metrics.outputSpeedTps).toBeCloseTo(12 / 0.071);
		// Throughput is still all output over the whole provider time.
		expect(metrics.effectiveThroughputTps).toBeCloseTo(85 / 1.378);
	});

	it("records no output speed when the whole answer arrived in one network read", () => {
		// A provider that held the answer and sent it at once: 467 tokens, 1 ms apart, one read.
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 467,
			providerDurationMs: 2_001,
			providerTtftMs: 2_000,
			gatewayE2eMs: 2_050,
			outputArrivals: 1,
		});
		expect(metrics.outputSpeedTps).toBeNull();
		expect(metrics.tpotMs).toBeNull();
		// Throughput over the whole provider time is still recorded.
		expect(metrics.effectiveThroughputTps).toBeCloseTo(467 / 2.001);
	});

	it("keeps a very fast speed when the output really streamed", () => {
		// No speed limit: 5,029 tokens across 40 reads in 588 ms is recorded as about 8,550 tokens per second.
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 5_029,
			providerDurationMs: 10_588,
			providerTtftMs: 10_000,
			gatewayE2eMs: 10_650,
			outputArrivals: 40,
		});
		expect(metrics.outputSpeedTps).toBeCloseTo(5_028 / 0.588);
	});

	it("records no output speed when no time passed after the first token", () => {
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 467,
			providerDurationMs: 2_000,
			providerTtftMs: 2_000,
			gatewayE2eMs: 2_050,
		});
		expect(metrics.outputSpeedTps).toBeNull();
		expect(metrics.tpotMs).toBeNull();
	});

	it("measures over a given window, such as a server-tool loop's last round", () => {
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 36,
			providerDurationMs: 6_188,
			providerTtftMs: 3_246,
			gatewayE2eMs: 6_817,
			speedWindow: { durationMs: 200, outputTokens: 21, reasoningTokens: 0 },
		});
		expect(metrics.tpotMs).toBe(10);
		expect(metrics.outputSpeedTps).toBe(100);
	});

	it("records no output speed when the given window was not measured", () => {
		const metrics = calculateOutputPerformanceMetrics({
			outputTokens: 36,
			providerDurationMs: 6_188,
			providerTtftMs: 3_246,
			gatewayE2eMs: 6_817,
			speedWindow: null,
		});
		expect(metrics.outputSpeedTps).toBeNull();
		expect(metrics.tpotMs).toBeNull();
	});
});

describe("getUsageReasoningTokens", () => {
	it("reads reasoning tokens from each usage shape", () => {
		expect(getUsageReasoningTokens({ reasoning_tokens: 7 })).toBe(7);
		expect(getUsageReasoningTokens({ output_tokens_details: { reasoning_tokens: 8 } })).toBe(8);
		expect(getUsageReasoningTokens({ completion_tokens_details: { reasoning_tokens: 9 } })).toBe(9);
		expect(getUsageReasoningTokens({ output_tokens: 10 })).toBeNull();
		expect(getUsageReasoningTokens(null)).toBeNull();
	});
});
