import {
	buildGuardrailRestrictionPreview,
	describeProviderRestrictionMode,
	type GuardrailPreviewProvider,
	type GuardrailPreviewProviderModel,
} from "./guardrailPreview";

const providers: GuardrailPreviewProvider[] = [
	{ id: "anthropic", name: "Anthropic" },
	{ id: "openai", name: "OpenAI" },
	{ id: "xai", name: "SpaceXAI" },
];

const activeProviderModels: GuardrailPreviewProviderModel[] = [
	{
		providerId: "anthropic",
		apiModelId: "claude-sonnet",
		internalModelId: "model_1",
	},
	{
		providerId: "anthropic",
		apiModelId: "claude-haiku",
		internalModelId: "model_2",
	},
	{
		providerId: "openai",
		apiModelId: "gpt-4.1",
		internalModelId: "model_3",
	},
	{
		providerId: "xai",
		apiModelId: "grok-4",
		internalModelId: "model_4",
	},
];

describe("describeProviderRestrictionMode", () => {
	test.each([
		["none", "Allow all"],
		["allowlist", "Only allow"],
		["blocklist", "Allow all except"],
	] as const)("maps %s to product copy", (mode, label) => {
		expect(describeProviderRestrictionMode(mode)).toBe(label);
	});
});

describe("buildGuardrailRestrictionPreview", () => {
	test("keeps every active route available when there are no restrictions", () => {
		expect(
			buildGuardrailRestrictionPreview({
				providers,
				activeProviderModels,
				providerRestrictionMode: "none",
				providerRestrictionProviderIds: [],
				modelRestrictionMode: "none",
				allowedApiModelIds: [],
			}),
		).toEqual({
			allowedProviderIds: ["anthropic", "openai", "xai"],
			blockedProviderIds: [],
			reachableProviderIds: ["anthropic", "openai", "xai"],
			reachableModelIds: ["claude-haiku", "claude-sonnet", "gpt-4.1", "grok-4"],
			blockedModelIds: [],
			activeRouteCount: 4,
			filteredRouteCount: 4,
		});
	});

	test("restricts providers when only selected providers are allowed", () => {
		expect(
			buildGuardrailRestrictionPreview({
				providers,
				activeProviderModels,
				providerRestrictionMode: "allowlist",
				providerRestrictionProviderIds: ["anthropic", "openai"],
				modelRestrictionMode: "none",
				allowedApiModelIds: [],
			}),
		).toEqual({
			allowedProviderIds: ["anthropic", "openai"],
			blockedProviderIds: ["xai"],
			reachableProviderIds: ["anthropic", "openai"],
			reachableModelIds: ["claude-haiku", "claude-sonnet", "gpt-4.1"],
			blockedModelIds: [],
			activeRouteCount: 4,
			filteredRouteCount: 3,
		});
	});

	test("combines provider and model restrictions into the final preview", () => {
		expect(
			buildGuardrailRestrictionPreview({
				providers,
				activeProviderModels,
				providerRestrictionMode: "blocklist",
				providerRestrictionProviderIds: ["xai"],
				modelRestrictionMode: "allowlist",
				allowedApiModelIds: ["claude-sonnet", "gpt-4.1"],
			}),
		).toEqual({
			allowedProviderIds: ["anthropic", "openai"],
			blockedProviderIds: ["xai"],
			reachableProviderIds: ["anthropic", "openai"],
			reachableModelIds: ["claude-sonnet", "gpt-4.1"],
			blockedModelIds: ["claude-haiku"],
			activeRouteCount: 4,
			filteredRouteCount: 2,
		});
	});
});
