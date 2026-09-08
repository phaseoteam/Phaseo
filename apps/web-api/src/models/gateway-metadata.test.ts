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
	it("does not treat an upstream-available offer as Phaseo-enabled", () => {
		const source: GatewayMetadataSource = {
			providerModels: [{
				provider_api_model_id: "pm-music",
				provider_id: "minimax",
				api_model_id: "minimax/music-3",
				is_active_gateway: true,
				provider_availability_status: "available",
				phaseo_status: "implementing",
				access_scope: "public",
				routing_status: "active",
				input_modalities: ["text", "audio"],
				output_modalities: ["audio"],
			}],
			caps: [{
				provider_api_model_id: "pm-music",
				capability_id: "music.generate",
				status: "active",
				params: {},
			}],
			providers: [{
				api_provider_id: "minimax",
				api_provider_name: "MiniMax",
				status: "active",
				routing_status: "active",
			}],
			aliases: [],
		};

		const metadata = composeGatewayMetadata("minimax/music-3", source);

		expect(metadata.activeProviders).toHaveLength(0);
		expect(metadata.comingSoonProviders).toHaveLength(1);
		expect(metadata.comingSoonProviders[0]).toMatchObject({
			provider_availability_status: "available",
			phaseo_status: "implementing",
			access_scope: "public",
			availability_reason: "phaseo_implementing",
		});
	});

	it("keeps internal testing distinct from public coming-soon routes", () => {
		const source: GatewayMetadataSource = {
			providerModels: [{
				provider_api_model_id: "pm-internal",
				provider_id: "minimax",
				api_model_id: "minimax/music-3",
				is_active_gateway: false,
				provider_availability_status: "available",
				phaseo_status: "testing",
				access_scope: "internal",
				routing_status: "active",
			}],
			caps: [{
				provider_api_model_id: "pm-internal",
				capability_id: "music.generate",
				status: "internal_testing",
			}],
			providers: [{
				api_provider_id: "minimax",
				api_provider_name: "MiniMax",
				status: "active",
				routing_status: "active",
			}],
			aliases: [],
		};

		const metadata = composeGatewayMetadata("minimax/music-3", source);
		expect(metadata.comingSoonProviders[0]).toMatchObject({
			phaseo_status: "testing",
			access_scope: "internal",
			availability_reason: "internal_testing",
		});
	});

	it("keeps a deprecated provider route active until its retirement window ends", () => {
		const source: GatewayMetadataSource = {
			providerModels: [{
				provider_api_model_id: "pm-deprecated",
				provider_id: "provider-a",
				api_model_id: "provider/model",
				is_active_gateway: true,
				provider_availability_status: "deprecated",
				phaseo_status: "enabled",
				access_scope: "public",
				routing_status: "active",
				effective_to: "2099-01-01T00:00:00Z",
			}],
			caps: [{ provider_api_model_id: "pm-deprecated", capability_id: "text.generate", status: "degraded", params: {} }],
			providers: [{ api_provider_id: "provider-a", api_provider_name: "Provider A", status: "active", routing_status: "active" }],
			aliases: [],
		};

		const metadata = composeGatewayMetadata("provider/model", source);

		expect(metadata.activeProviders).toHaveLength(1);
		expect(metadata.activeProviders[0]).toMatchObject({
			provider_availability_status: "deprecated",
			capability_status: "degraded",
			availability_reason: "provider_deprecated",
		});
	});

	it("retires a deprecated provider route after its effective_to", () => {
		const source: GatewayMetadataSource = {
			providerModels: [{
				provider_api_model_id: "pm-expired",
				provider_id: "provider-a",
				api_model_id: "provider/model",
				is_active_gateway: true,
				provider_availability_status: "deprecated",
				phaseo_status: "enabled",
				access_scope: "public",
				routing_status: "active",
				effective_to: "2000-01-01T00:00:00Z",
			}],
			caps: [{ provider_api_model_id: "pm-expired", capability_id: "text.generate", status: "degraded", params: {} }],
			providers: [{ api_provider_id: "provider-a", api_provider_name: "Provider A", status: "active", routing_status: "active" }],
			aliases: [],
		};

		const metadata = composeGatewayMetadata("provider/model", source);

		expect(metadata.activeProviders).toHaveLength(0);
		expect(metadata.inactiveProviders).toHaveLength(1);
		expect(metadata.inactiveProviders[0].availability_reason).toBe("retired");
	});

});
