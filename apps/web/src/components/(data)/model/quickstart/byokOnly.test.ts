import { getByokOnlyProviders } from "./byokOnly";
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
});
