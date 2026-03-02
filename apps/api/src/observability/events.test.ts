import { describe, expect, it } from "vitest";
import { extractRoutingFailureSignals } from "./events";

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

