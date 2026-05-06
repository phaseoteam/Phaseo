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
});
