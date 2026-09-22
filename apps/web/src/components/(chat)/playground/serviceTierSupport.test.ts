import {
	getModelServiceTierSupport,
	getRouteServiceTierSupport,
	getServiceTierOptions,
	resolveChatServiceTier,
} from "./serviceTierSupport";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

function gatewayModel(
	modelId: string,
	capabilityParamsById: GatewaySupportedModel["capabilityParamsById"],
): GatewaySupportedModel {
	return {
		modelId,
		internalModelId: modelId,
		selectorModelId: modelId,
		providerId: "spacex-ai",
		capabilities: ["text.generate"],
		capabilityParamsById,
		effectiveFrom: null,
		effectiveTo: null,
		providerName: "SpaceX AI",
		providerFamilyId: null,
		providerOfferLabel: null,
		providerOfferScope: null,
		providerPromptTrainingPolicy: null,
		modelName: modelId,
		modelStatus: "active",
		organisationId: "spacex-ai",
		organisationName: "SpaceX AI",
		previousModelId: null,
		releaseDate: null,
		announcementDate: null,
		inputPricePerMillion: null,
		outputPricePerMillion: null,
		isAvailable: true,
	};
}

describe("chat service tier support", () => {
	it("keeps Grok 4.7 on Standard when no service tier is advertised", () => {
		const support = getModelServiceTierSupport({
			models: [
				gatewayModel("spacex-ai/grok-4.7", {
					"text.generate": {
						reasoning: {
							effort: { supported_values: ["low", "medium", "high", "xhigh"] },
						},
					},
				}),
			],
			modelId: "spacex-ai/grok-4.7",
		});

		expect(support).toEqual({ supportedValues: ["standard"] });
		expect(getServiceTierOptions(support)).toEqual([
			{ value: "standard", label: "Standard" },
		]);
	});

	it("reads Priority from a legacy service tier parameter note", () => {
		const support = getRouteServiceTierSupport([
			{
				param_id: "service_tier",
				provider_default: "standard",
				notes: "Priority Processing is available at 2x standard token prices.",
			},
		]);
		expect(support).toEqual({
			supportedValues: ["standard", "priority"],
			defaultValue: "standard",
		});
		expect(getServiceTierOptions(support)).toEqual([
			{ value: "standard", label: "Standard" },
			{ value: "priority", label: "Fast" },
		]);
	});

	it("intersects tiers across automatic provider routes", () => {
		const models = [
			gatewayModel("vendor/model", { "text.generate": [] }),
			gatewayModel("vendor/model", {
				"text.generate": [
					{
						param_id: "service_tier",
						provider_default: "standard",
						notes: "Priority Processing is available.",
					},
				],
			}),
		];
		models[1] = { ...models[1], providerId: "other-provider" };

		expect(
			getModelServiceTierSupport({ models, modelId: "vendor/model" }),
		).toEqual({ supportedValues: ["standard"] });
	});

	it("falls back to a supported tier when a saved value is unavailable", () => {
		expect(
			resolveChatServiceTier("flex", { supportedValues: ["standard"] }),
		).toBe("standard");
	});
});
