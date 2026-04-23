import { describe, expect, it } from "vitest";

import { buildObservabilityPlan } from "../events";

describe("buildObservabilityPlan", () => {
	it("always emits full-detail events for failures", () => {
		const plan = buildObservabilityPlan(
			{
				requestId: "G-failure",
				success: false,
				statusCode: 500,
			},
			{} as any,
		);

		expect(plan.emit).toBe(true);
		expect(plan.detailLevel).toBe("full");
		expect(plan.reason).toBe("error");
	});

	it("drops success traffic when success sampling is disabled", () => {
		const plan = buildObservabilityPlan(
			{
				requestId: "G-success-drop",
				success: true,
			},
			{
				AXIOM_SUCCESS_SAMPLE_RATE: "0",
			} as any,
		);

		expect(plan.emit).toBe(false);
		expect(plan.reason).toBe("dropped_success");
	});

	it("keeps compact success events when success sampling hits but detail sampling does not", () => {
		const plan = buildObservabilityPlan(
			{
				requestId: "G-success-compact",
				success: true,
			},
			{
				AXIOM_SUCCESS_SAMPLE_RATE: "1",
				AXIOM_DETAIL_SAMPLE_RATE: "0",
			} as any,
		);

		expect(plan.emit).toBe(true);
		expect(plan.detailLevel).toBe("compact");
		expect(plan.reason).toBe("sampled_success");
	});

	it("keeps full-detail events for debug requests", () => {
		const plan = buildObservabilityPlan(
			{
				requestId: "G-debug",
				success: true,
				ctx: {
					meta: {
						debug: { enabled: true },
					},
				} as any,
			},
			{} as any,
		);

		expect(plan.emit).toBe(true);
		expect(plan.detailLevel).toBe("full");
		expect(plan.reason).toBe("debug");
	});

	it("keeps full-detail events for slow successes", () => {
		const plan = buildObservabilityPlan(
			{
				requestId: "G-slow",
				success: true,
				ctx: {
					meta: {
						latency_ms: 9_500,
					},
				} as any,
			},
			{
				AXIOM_SUCCESS_SAMPLE_RATE: "0",
				AXIOM_SLOW_REQUEST_MS: "8000",
			} as any,
		);

		expect(plan.emit).toBe(true);
		expect(plan.detailLevel).toBe("full");
		expect(plan.reason).toBe("slow");
	});
});
