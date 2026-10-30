import { getByokOnlyProviders } from "@/components/(data)/model/quickstart/byokOnly";
import { toQuickstartGatewayMetadata } from "@/components/(data)/model/quickstart/quickstartGatewayMetadata";
import type {
	GatewayProviderModel,
	ModelGatewayMetadata,
} from "@/lib/fetchers/models/getModelGatewayMetadata";

function provider(index: number, endpoint: string, credentialMode: "managed_and_byok" | "byok_only"): GatewayProviderModel {
	return {
		id: `route-${index}`,
		api_provider_id: `provider-${index}`,
		model_id: "test/model",
		provider_model_slug: "test-model-v1",
		context_length: 128_000,
		endpoint,
		is_active_gateway: true,
		availability_status: "active",
		input_modalities: "text",
		output_modalities: "text",
		credential_mode: credentialMode,
		provider: {
			api_provider_id: `provider-${index}`,
			api_provider_name: `Provider ${index}`,
			privacy_policy_url: "https://example.com/privacy",
			prompt_training_notes: "A long policy note. ".repeat(40),
			default_data_regions: ["us", "eu"],
		},
	};
}

function metadata(modes: Array<"managed_and_byok" | "byok_only">): ModelGatewayMetadata {
	const active = modes.map((mode, index) => provider(index, index === 0 ? "responses" : "chat.completions", mode));
	const inactive = [{ ...provider(9, "embeddings", "managed_and_byok"), is_active_gateway: false, availability_status: "inactive" as const }];
	return {
		modelId: "test/model",
		aliases: ["test/alias"],
		apiModelIds: ["test-model"],
		primaryModelIdentifier: "test/model",
		acceptedModelIdentifiers: ["test/model", "test/alias"],
		primaryModelIdentifierByEndpoint: { responses: "test/model" },
		acceptedModelIdentifiersByEndpoint: { responses: ["test/model"] },
		supportedParametersByEndpoint: {
			responses: [{ param_id: "temperature", provider_count_supported: 1, provider_count_total: 2, support_level: "some_providers", providers: [] }],
		},
		providers: [...active, ...inactive],
		activeProviders: active,
		comingSoonProviders: [],
		inactiveProviders: inactive,
	};
}

it("keeps everything the header and quickstart sheet read", () => {
	const full = metadata(["managed_and_byok", "managed_and_byok"]);
	const trimmed = toQuickstartGatewayMetadata(full)!;
	for (const key of [
		"modelId", "aliases", "apiModelIds", "primaryModelIdentifier", "acceptedModelIdentifiers",
		"primaryModelIdentifierByEndpoint", "acceptedModelIdentifiersByEndpoint", "supportedParametersByEndpoint",
	] as const) {
		expect(trimmed[key]).toEqual(full[key]);
	}
	expect(trimmed.activeProviders.map((entry) => entry.endpoint)).toEqual(["responses", "chat.completions"]);
	expect(trimmed.providers.find((entry) => entry.endpoint)?.endpoint).toBe("responses");
	expect(trimmed.activeProviders[0].provider).toEqual({ api_provider_id: "provider-0", api_provider_name: "Provider 0" });
	expect(getByokOnlyProviders(trimmed)).toEqual(getByokOnlyProviders(full));
});

it("matches the BYOK-only notice of the full metadata", () => {
	const full = metadata(["byok_only", "byok_only"]);
	expect(getByokOnlyProviders(toQuickstartGatewayMetadata(full))).toEqual([
		{ providerId: "provider-0", providerName: "Provider 0" },
		{ providerId: "provider-1", providerName: "Provider 1" },
	]);
});

it("drops provider policy details and inactive routes", () => {
	const full = metadata(["managed_and_byok", "byok_only"]);
	const trimmed = toQuickstartGatewayMetadata(full)!;
	expect(trimmed.inactiveProviders).toEqual([]);
	expect(JSON.stringify(trimmed)).not.toContain("policy note");
	expect(JSON.stringify(trimmed).length).toBeLessThan(JSON.stringify(full).length / 3);
	expect(toQuickstartGatewayMetadata(null)).toBeNull();
});
