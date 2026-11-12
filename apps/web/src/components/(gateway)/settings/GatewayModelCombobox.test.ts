import { describe, it, expect } from "vitest";
import { buildGatewayModelOptions } from "./GatewayModelCombobox";
import { classifierRequestFormat } from "./classifiers/requestClassifiers";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

function model(overrides: Partial<GatewaySupportedModel>): GatewaySupportedModel {
	return {
		modelId: "acme/fast", internalModelId: null, selectorModelId: "acme/fast", providerId: "acme", capabilities: ["text.generate"],
		capabilityParamsById: {}, effectiveFrom: null, effectiveTo: null, providerName: "Acme", providerFamilyId: null, providerOfferLabel: null,
		providerOfferScope: null, providerPromptTrainingPolicy: null, modelName: "Fast", modelStatus: "active", organisationId: "acme",
		organisationName: "Acme", previousModelId: null, releaseDate: "2026-01-01", announcementDate: null, isAvailable: true,
		...overrides,
	};
}

describe("gateway model options", () => {
	it("merges providers and marks structured output support from any of them", () => {
		const options = buildGatewayModelOptions([
			model({ providerId: "one", providerName: "One" }),
			model({ providerId: "two", providerName: "Two", capabilityParamsById: { "text.generate": { structured_outputs: {} } } }),
			model({ modelId: "acme/old", selectorModelId: "acme/old", modelName: "Old", releaseDate: "2025-01-01", capabilityParamsById: { "text.generate": { temperature: {} } } }),
			model({ modelId: "acme/gone", selectorModelId: "acme/gone", isAvailable: false }),
		]);
		expect(options.map((option) => [option.id, option.providerNames, option.structuredOutputs])).toEqual([
			["acme/fast", ["One", "Two"], true],
			["acme/old", ["Acme"], false],
		]);
	});

	it("treats response_format support as structured output support", () => {
		const [option] = buildGatewayModelOptions([model({ capabilityParamsById: { "text.generate": { response_format: { types: ["json_schema"] } } } })]);
		expect(option?.structuredOutputs).toBe(true);
	});

	it("keeps each provider's capabilities so a classifier can pick its request format", () => {
		const options = buildGatewayModelOptions([
			model({ modelId: "acme/judge", selectorModelId: "acme/judge", capabilities: ["decisions.make"], capabilityParamsById: {} }),
			model({ capabilityParamsById: { "text.generate": { temperature: {} } } }),
		]);
		const format = (id: string) => classifierRequestFormat(options.find((option) => option.id === id)!.routeCapabilities);
		expect(format("acme/judge")).toBe("decisions");
		expect(format("acme/fast")).toBe("json");
	});
});
