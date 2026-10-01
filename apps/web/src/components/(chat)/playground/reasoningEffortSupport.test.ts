import {
	combineReasoningEffortSupports,
	filterReasoningEffortOptions,
	getModelReasoningEffortSupport,
	getRouteReasoningEffortSupport,
	resolveChatReasoningEffort,
} from "./reasoningEffortSupport";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

function gatewayModel(
	providerId: string,
	modelId: string,
	capabilityParamsById: GatewaySupportedModel["capabilityParamsById"] = {},
): GatewaySupportedModel {
	return {
		modelId,
		internalModelId: "vendor/model",
		selectorModelId: "vendor/model",
		providerId,
		capabilities: ["text.generate"],
		capabilityParamsById,
		effectiveFrom: null,
		effectiveTo: null,
		providerName: providerId,
		providerFamilyId: null,
		providerOfferLabel: null,
		providerOfferScope: null,
		providerPromptTrainingPolicy: null,
		modelName: "Model",
		modelStatus: "active",
		organisationId: "vendor",
		organisationName: "Vendor",
		previousModelId: null,
		releaseDate: null,
		announcementDate: null,
		isAvailable: true,
	};
}

describe("chat reasoning effort support", () => {
	it("reads exact support from nested route metadata", () => {
		expect(
			getRouteReasoningEffortSupport({
				reasoning: {
					effort: {
						supported_values: ["low", "medium", "high", "xhigh"],
						default_value: "high",
					},
				},
			}),
		).toEqual({
			supportedValues: ["low", "medium", "high", "xhigh"],
			defaultValue: "high",
		});
	});

	it("reads reasoning enums from the legacy database parameter array", () => {
		expect(
			getRouteReasoningEffortSupport([
				{
					param_id: "reasoning_effort",
					type: "enum",
					values: ["instant", "medium", "high"],
					provider_default: "medium",
				},
			]),
		).toEqual({
			supportedValues: ["instant", "medium", "high"],
			defaultValue: "medium",
		});
	});

	it("intersects exact route options when automatic routing has multiple providers", () => {
		const models = [
			gatewayModel("provider-a", "vendor/model", {
				"text.generate": [
					{ param_id: "reasoning_effort", values: ["low", "medium", "high"] },
				],
			}),
			gatewayModel("provider-b", "vendor/model", {
				"text.generate": {
					reasoning: {
						effort: { supported_values: ["medium", "high", "xhigh"] },
					},
				},
			}),
			gatewayModel("provider-c", "vendor/model"),
		];

		expect(
			getModelReasoningEffortSupport({ models, modelId: "vendor/model" }),
		).toEqual({ supportedValues: ["medium", "high"] });
		expect(
			getModelReasoningEffortSupport({
				models,
				modelId: "vendor/model",
				providerId: "provider-b",
				requestModelId: "vendor/model",
			}),
		).toEqual({ supportedValues: ["medium", "high", "xhigh"] });
	});

	it("uses a supported default when the saved effort is no longer valid", () => {
		const support = combineReasoningEffortSupports([
			{ supportedValues: ["low", "high"], defaultValue: "high" },
		]);
		expect(resolveChatReasoningEffort("medium", support)).toBe("high");
	});

	it("only exposes the effort options supported by the selected model", () => {
		const options = [
			{ value: "instant" as const, label: "Instant" },
			{ value: "low" as const, label: "Low" },
			{ value: "medium" as const, label: "Medium" },
			{ value: "high" as const, label: "High" },
			{ value: "xhigh" as const, label: "Extra High" },
		];

		expect(
			filterReasoningEffortOptions(options, {
				supportedValues: ["low", "high"],
			}),
		).toEqual([
			{ value: "low", label: "Low" },
			{ value: "high", label: "High" },
		]);
	});

	it("does not expose instant when capability metadata is unavailable", () => {
		const options = [
			{ value: "instant" as const, label: "Instant" },
			{ value: "medium" as const, label: "Medium" },
		];

		expect(filterReasoningEffortOptions(options, null)).toEqual([
			{ value: "medium", label: "Medium" },
		]);
	});

	it("repairs a saved instant effort when capability metadata is unavailable", () => {
		expect(resolveChatReasoningEffort("instant", null)).toBe("medium");
	});
});
