import { describe, expect, it } from "vitest";
import { composeGatewayMetadata, type GatewayMetadataSource } from "@/models/gateway-metadata";

describe("composeGatewayMetadata", () => {
	it("builds cached public identifiers, provider buckets, and parameter support", () => {
		const source: GatewayMetadataSource = {
			providerModels: [
				{ provider_api_model_id: "pm-active", provider_id: "provider-a", api_model_id: "openai/gpt-test", is_active_gateway: true, routing_status: "active", input_modalities: ["text"], output_modalities: ["text"], context_length: 128000 },
				{ provider_api_model_id: "pm-future", provider_id: "provider-b", api_model_id: "openai/gpt-test-preview", is_active_gateway: true, routing_status: "active", effective_from: "2999-01-01T00:00:00Z", input_modalities: ["text"], output_modalities: ["text"] },
			],
			caps: [
				{ provider_api_model_id: "pm-active", capability_id: "text.generate", status: "active", params: { properties: { temperature: { type: "number" }, max_tokens: { type: "integer" } } } },
				{ provider_api_model_id: "pm-future", capability_id: "text.generate", status: "active", params: {} },
			],
			providers: [
				{ api_provider_id: "provider-a", api_provider_name: "Provider A", status: "active", routing_status: "active" },
				{ api_provider_id: "provider-b", api_provider_name: "Provider B", status: "active", routing_status: "active" },
			],
			aliases: [{ api_model_id: "openai/gpt-test", alias_slug: "openai/gpt-test-latest" }],
		};

		const metadata = composeGatewayMetadata("openai/gpt-test", source);

		expect(metadata.primaryModelIdentifier).toBe("openai/gpt-test");
		expect(metadata.acceptedModelIdentifiers).toEqual(["openai/gpt-test", "openai/gpt-test-latest"]);
		expect(metadata.activeProviders).toHaveLength(1);
		expect(metadata.comingSoonProviders).toHaveLength(1);
		expect(metadata.inactiveProviders).toHaveLength(0);
		expect(metadata.primaryModelIdentifierByEndpoint["text.generate"]).toBe("openai/gpt-test");
		expect(metadata.supportedParametersByEndpoint["chat.completions"]).toMatchObject([
			{ param_id: "max_tokens", provider_count_supported: 1, provider_count_total: 1, support_level: "all_providers" },
			{ param_id: "temperature", provider_count_supported: 1, provider_count_total: 1, support_level: "all_providers" },
		]);
	});
});
