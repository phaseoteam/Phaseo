import { getByokOnlyProviders } from "@/components/(data)/model/quickstart/byokOnly";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";

function metadata(
	modes: Array<"managed_and_byok" | "byok_only">,
): ModelGatewayMetadata {
	const providers = modes.map((credentialMode, index) => ({
		id: `route-${index}`,
		api_provider_id: `provider-${index}`,
		model_id: "test/model",
		endpoint: "responses",
		is_active_gateway: true,
		availability_status: "active" as const,
		input_modalities: "text",
		output_modalities: "text",
		credential_mode: credentialMode,
		provider: {
			api_provider_id: `provider-${index}`,
			api_provider_name: `Provider ${index}`,
			credential_mode: credentialMode,
		},
	}));
	return {
		modelId: "test/model",
		aliases: [],
		apiModelIds: ["test/model"],
		primaryModelIdentifier: "test/model",
		acceptedModelIdentifiers: ["test/model"],
		primaryModelIdentifierByEndpoint: {},
		acceptedModelIdentifiersByEndpoint: {},
		supportedParametersByEndpoint: {},
		providers,
		activeProviders: providers,
		comingSoonProviders: [],
		inactiveProviders: [],
	};
}

describe("getByokOnlyProviders", () => {
	it("returns active providers when every route requires BYOK", () => {
		expect(getByokOnlyProviders(metadata(["byok_only"]))).toEqual([
			{ providerId: "provider-0", providerName: "Provider 0" },
		]);
	});

	it("does not warn when a managed route is available", () => {
		expect(
			getByokOnlyProviders(metadata(["byok_only", "managed_and_byok"])),
		).toEqual([]);
	});

	it("ignores an inactive managed route when every active route requires BYOK", () => {
		const value = metadata(["byok_only", "managed_and_byok"]);
		value.activeProviders = [value.providers[0]];
		value.inactiveProviders = [value.providers[1]];

		expect(getByokOnlyProviders(value)).toEqual([
			{ providerId: "provider-0", providerName: "Provider 0" },
		]);
	});
});
