import { describe, expect, it } from "vitest";
import { extractRoutingFailureSignals, extractUpstreamErrorSummary } from "./events";

describe("extractRoutingFailureSignals", () => {
	it("extracts provider_status_not_ready details from routing diagnostics", () => {
		const signals = extractRoutingFailureSignals({
			success: false,
			errorDetails: {
				routing_diagnostics: {
					finalCandidateCount: 0,
					filterStages: [
						{
							stage: "status_gate",
							beforeCount: 1,
							afterCount: 0,
							droppedProviders: [
								{ providerId: "openai", reason: "provider_status_not_ready" },
							],
						},
						{
							stage: "capability_status_gate",
							beforeCount: 0,
							afterCount: 0,
							droppedProviders: [],
						},
					],
				},
			},
		} as any);

		expect(signals.finalCandidateCount).toBe(0);
		expect(signals.statusGateBeforeCount).toBe(1);
		expect(signals.statusGateAfterCount).toBe(0);
		expect(signals.capabilityGateBeforeCount).toBe(0);
		expect(signals.capabilityGateAfterCount).toBe(0);
		expect(signals.dropReasons).toContain("provider_status_not_ready");
		expect(signals.providerStatusNotReadyProviders).toEqual(["openai"]);
	});
});

describe("extractUpstreamErrorSummary", () => {
	it("extracts upstream details from providerResponse.error shape", () => {
		const summary = extractUpstreamErrorSummary({
			success: false,
			providerResponse: {
				error: {
					code: "invalid_request_error",
					type: "invalid_request_error",
					param: "messages",
					message: "messages is invalid",
					status: 400,
				},
			},
		} as any);

		expect(summary).toEqual({
			code: "invalid_request_error",
			type: "invalid_request_error",
			param: "messages",
			message: "messages is invalid",
			status: 400,
			raw: {
				error: {
					code: "invalid_request_error",
					type: "invalid_request_error",
					param: "messages",
					message: "messages is invalid",
					status: 400,
				},
			},
		});
	});

	it("extracts fallback fields from errorDetails root shape", () => {
		const summary = extractUpstreamErrorSummary({
			success: false,
			errorDetails: {
				error_code: "quota_exceeded",
				error_type: "rate_limit",
				error_description: "Quota exceeded",
				status: "429",
			},
		} as any);

		expect(summary?.code).toBe("quota_exceeded");
		expect(summary?.type).toBe("rate_limit");
		expect(summary?.message).toBe("Quota exceeded");
		expect(summary?.status).toBe(429);
	});

	it("returns null when no upstream summary fields exist", () => {
		const summary = extractUpstreamErrorSummary({
			success: false,
			errorDetails: { foo: "bar" },
		} as any);

		expect(summary).toBeNull();
	});

	it("falls back to errors array + statusCode when needed", () => {
		const summary = extractUpstreamErrorSummary({
			success: false,
			statusCode: 503,
			errorDetails: {
				errors: [{ message: "temporary upstream outage" }],
			},
		} as any);

		expect(summary?.message).toBe("temporary upstream outage");
		expect(summary?.status).toBe(503);
	});
});

