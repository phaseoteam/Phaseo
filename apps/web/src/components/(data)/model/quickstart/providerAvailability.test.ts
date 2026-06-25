import type { GatewayProviderModel, ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { groupProviders, resolveProviderState } from "./providerAvailability";

function makeProvider(
	overrides: Partial<GatewayProviderModel> = {}
): GatewayProviderModel {
	return {
		id: "provider-model-1",
		api_provider_id: "anthropic",
		model_id: "anthropic/claude-3-haiku",
		endpoint: "responses",
		is_active_gateway: false,
		availability_status: "inactive",
		input_modalities: "text",
		output_modalities: "text",
		provider: {
			api_provider_id: "anthropic",
			api_provider_name: "Anthropic",
			residency_mode: "unknown",
			default_execution_regions: null,
			default_data_regions: null,
			zero_data_retention: "optional",
			residency_source_url: "https://code.claude.com/docs/en/data-usage",
			residency_notes: null,
		},
		...overrides,
	};
}

function makeMetadata(providers: GatewayProviderModel[]): ModelGatewayMetadata {
	return {
		modelId: "anthropic/claude-3-haiku",
		aliases: [],
		apiModelIds: ["anthropic/claude-3-haiku"],
		primaryModelIdentifier: "anthropic/claude-3-haiku",
		acceptedModelIdentifiers: ["anthropic/claude-3-haiku"],
		primaryModelIdentifierByEndpoint: {},
		acceptedModelIdentifiersByEndpoint: {},
		supportedParametersByEndpoint: {},
		providers,
		activeProviders: providers.filter((provider) => provider.availability_status === "active"),
		comingSoonProviders: providers.filter((provider) => provider.availability_status === "coming_soon"),
		inactiveProviders: providers.filter((provider) => provider.availability_status === "inactive"),
	};
}

describe("resolveProviderState", () => {
	test("keeps preview_only distinct from generic provider inactivity", () => {
		expect(
			resolveProviderState(
				makeProvider({
					availability_status: "coming_soon",
					availability_reason: "preview_only",
					provider_status: "beta",
				})
			)
		).toMatchObject({
			key: "preview_only",
			label: "Preview Only",
			availability: "coming_soon",
		});
	});

	test("keeps provider_not_ready distinct from generic provider inactivity", () => {
		expect(
			resolveProviderState(
				makeProvider({
					availability_status: "inactive",
					availability_reason: "provider_not_ready",
					provider_status: "not_ready",
				})
			)
		).toMatchObject({
			key: "provider_not_ready",
			label: "Provider Not Ready",
			availability: "inactive",
		});
	});

	test.each([
		["gated", "Gated Access"],
		["access_limited", "Access Limited"],
		["region_limited", "Region Limited"],
		["project_limited", "Project Limited"],
		["paused", "Paused"],
		["soft_blocked", "Soft Blocked"],
	] as const)("keeps %s distinct from generic provider inactivity", (providerStatus, label) => {
		expect(
			resolveProviderState(
				makeProvider({
					availability_status: "inactive",
					availability_reason: providerStatus,
					provider_status: providerStatus,
				})
			)
		).toMatchObject({
			key: providerStatus,
			label,
			availability: "inactive",
		});
	});
});

describe("groupProviders", () => {
	test("preserves preview_only as the grouped provider state", () => {
		const [provider] = groupProviders(
			makeMetadata([
				makeProvider({
					availability_status: "coming_soon",
					availability_reason: "preview_only",
					provider_status: "beta",
				}),
			])
		);

		expect(provider.state).toMatchObject({
			key: "preview_only",
			label: "Preview Only",
			availability: "coming_soon",
		});
	});

	test("prefers provider_not_ready over generic inactive states when grouping", () => {
		const [provider] = groupProviders(
			makeMetadata([
				makeProvider({
					id: "provider-model-1",
					availability_status: "inactive",
					availability_reason: "inactive",
				}),
				makeProvider({
					id: "provider-model-2",
					endpoint: "chat.completions",
					availability_status: "inactive",
					availability_reason: "provider_not_ready",
					provider_status: "not_ready",
				}),
			])
		);

		expect(provider.state).toMatchObject({
			key: "provider_not_ready",
			label: "Provider Not Ready",
			availability: "inactive",
		});
	});

	test("prefers region-limited over generic inactive states when grouping", () => {
		const [provider] = groupProviders(
			makeMetadata([
				makeProvider({
					id: "provider-model-1",
					availability_status: "inactive",
					availability_reason: "inactive",
				}),
				makeProvider({
					id: "provider-model-2",
					endpoint: "chat.completions",
					availability_status: "inactive",
					availability_reason: "region_limited",
					provider_status: "region_limited",
				}),
			])
		);

		expect(provider.state).toMatchObject({
			key: "region_limited",
			label: "Region Limited",
			availability: "inactive",
		});
	});

	test("aggregates seeded residency metadata for provider cards", () => {
		const [provider] = groupProviders(
			makeMetadata([
				makeProvider({
					api_provider_id: "openai",
					provider_model_slug: "gpt-5.4-mini",
					availability_status: "active",
					availability_reason: "active",
					is_active_gateway: true,
					provider: {
						api_provider_id: "openai",
						api_provider_name: "OpenAI",
						residency_mode: "customer_selectable",
						default_execution_regions: ["us", "eu"],
						default_data_regions: ["us", "eu"],
						zero_data_retention: "optional",
						residency_source_url:
							"https://developers.openai.com/api/docs/guides/your-data",
						residency_notes: null,
					},
				}),
			]),
		);

		expect(Array.from(provider.executionRegions)).toEqual(["us", "eu"]);
		expect(Array.from(provider.dataRegions)).toEqual(["us", "eu"]);
		expect(provider.zeroDataRetention).toBe("optional");
		expect(provider.residency[0]).toMatchObject({
			residencyMode: "customer_selectable",
			zeroDataRetention: "optional",
		});
	});

	test("groups specialized offers under the provider family", () => {
		const [provider] = groupProviders(
			makeMetadata([
				makeProvider({
					id: "provider-model-1",
					api_provider_id: "minimax",
					model_id: "minimax/minimax-m2.1",
					availability_status: "active",
					availability_reason: "active",
					is_active_gateway: true,
					provider: {
						api_provider_id: "minimax",
						api_provider_name: "MiniMax",
						provider_family_id: "minimax",
						offer_scope: "global",
						offer_label: null,
						residency_mode: "unknown",
						default_execution_regions: null,
						default_data_regions: null,
						zero_data_retention: "optional",
						residency_source_url: null,
						residency_notes: null,
					},
				}),
				makeProvider({
					id: "provider-model-2",
					api_provider_id: "minimax-lightning",
					model_id: "minimax/minimax-m2.1",
					endpoint: "chat.completions",
					availability_status: "active",
					availability_reason: "active",
					is_active_gateway: true,
					provider: {
						api_provider_id: "minimax-lightning",
						api_provider_name: "MiniMax Lightning",
						provider_family_id: "minimax",
						offer_scope: "specialized",
						offer_label: "priority",
						residency_mode: "unknown",
						default_execution_regions: null,
						default_data_regions: null,
						zero_data_retention: "optional",
						residency_source_url: null,
						residency_notes: null,
					},
				}),
			]),
		);

		expect(provider.providerId).toBe("minimax");
		expect(provider.providerName).toBe("MiniMax");
		expect(Array.from(provider.providerIds)).toEqual([
			"minimax",
			"minimax-lightning",
		]);
		expect(Array.from(provider.offerLabels).sort()).toEqual([
			"Priority",
			"Standard",
		]);
	});
});
