import {
	getModelServiceTierSupport,
	getRouteServiceTierSupport,
	getServiceTierOptions,
	resolveChatServiceTier,
	assertChatServiceTierSupported,
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
	it("uses priced tiers even when capability params omit service tier", () => {
		const model = {
			...gatewayModel("openai/gpt-6-astra", { "text.generate": [] }),
			serviceTiers: ["standard", "priority", "flex", "ultrafast", "batch"],
		};
		const support = getModelServiceTierSupport({ models: [model], modelId: model.modelId });
		expect(getServiceTierOptions(support).map((option) => option.value)).toEqual([
			"standard", "priority", "ultrafast", "flex",
		]);
		expect(resolveChatServiceTier("ultrafast")).toBe("ultrafast");
		expect(() => assertChatServiceTierSupported("ultrafast", support)).not.toThrow();
	});

	it("keeps priced tiers authoritative and respects provider selection", () => {
		const models = [
			{ ...gatewayModel("openai/gpt-6.1-sol", { "text.generate": [] }), serviceTiers: ["standard", "priority", "flex"] },
			{ ...gatewayModel("openai/gpt-6.1-sol", { "text.generate": { service_tier: ["standard", "priority"] } }), providerId: "other", serviceTiers: ["standard"] },
		];
		expect(getModelServiceTierSupport({ models, modelId: models[0].modelId })?.supportedValues).toEqual(["standard"]);
		expect(getModelServiceTierSupport({ models, modelId: models[0].modelId, providerId: "spacex-ai" })?.supportedValues).toEqual(["standard", "priority", "flex"]);
	});

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

	it.each(["priority", "flex", "ultrafast"] as const)("never opts into %s when it is the only priced tier", (tier) => {
		const model = { ...gatewayModel("vendor/model", { "text.generate": [] }), serviceTiers: [tier] };
		const support = getModelServiceTierSupport({ models: [model], modelId: model.modelId });
		const selected = resolveChatServiceTier(undefined);
		expect(selected).toBe("standard");
		expect(() => assertChatServiceTierSupported(selected, support)).toThrow("Choose a supported tier");
		expect(() => assertChatServiceTierSupported(tier, support)).not.toThrow();
	});

	it("preserves and rejects an unavailable saved tier instead of switching it", () => {
		const selected = resolveChatServiceTier("flex");
		expect(selected).toBe("flex");
		expect(() => assertChatServiceTierSupported(selected, {
			supportedValues: ["priority"], defaultValue: "priority",
		})).toThrow("Choose a supported tier");
	});

	it("keeps Standard when tier metadata is absent", () => {
		expect(() => assertChatServiceTierSupported(resolveChatServiceTier(undefined), null)).not.toThrow();
		expect(() => assertChatServiceTierSupported("priority", null)).toThrow();
	});
});
