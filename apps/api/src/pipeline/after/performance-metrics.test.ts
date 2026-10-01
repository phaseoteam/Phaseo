import { describe, expect, it } from "vitest";
import { calculateOutputPerformanceMetrics } from "./performance-metrics";

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
});
