import { isChatModelRowDisabled } from "./chat-model-selection";

const activeModel = {
	gatewayStatus: "active" as const,
	chatBlockedReasons: [],
};

describe("isChatModelRowDisabled", () => {
	it("disables a model blocked by the effective Chat policy", () => {
		expect(
			isChatModelRowDisabled(
				{
					...activeModel,
					chatBlockedReasons: [{ source: "guardrail" }],
				},
				{ capabilityCompatible: true },
			),
		).toBe(true);
	});

	it("keeps an available, compatible model selectable", () => {
		expect(
			isChatModelRowDisabled(activeModel, { capabilityCompatible: true }),
		).toBe(false);
	});

	it("disables an inactive gateway model", () => {
		expect(
			isChatModelRowDisabled(
				{ ...activeModel, gatewayStatus: "inactive" },
				{ capabilityCompatible: true },
			),
		).toBe(true);
	});
});
