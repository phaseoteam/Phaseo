import { describe, expect, it } from "vitest";
import {
	extractRequestedParams,
	getUnknownTopLevelParams,
	getUnsupportedParamsForProvider,
	providerSupportsParam,
} from "./paramCapabilities";
import {
	isAlwaysSupportedParam,
	resolveProviderParamSupportOverride,
	textEndpointRegistryFor,
} from "./textParamPolicy";

describe("textParamPolicy", () => {
	it("exposes endpoint registries for text routes", () => {
		expect(textEndpointRegistryFor("chat.completions")).toBeTruthy();
		expect(textEndpointRegistryFor("responses")).toBeTruthy();
		expect(textEndpointRegistryFor("messages")).toBeTruthy();
		expect(textEndpointRegistryFor("embeddings")).toBeNull();
	});

	it("marks always-supported params centrally", () => {
		expect(isAlwaysSupportedParam("responses", "modalities")).toBe(true);
		expect(isAlwaysSupportedParam("responses", "cache_control")).toBe(true);
		expect(isAlwaysSupportedParam("messages", "max_tokens")).toBe(true);
		expect(isAlwaysSupportedParam("responses", "temperature")).toBe(false);
	});

	it("allows top-level cache controls on text surfaces", () => {
		const cacheFields = {
			cache_control: { type: "ephemeral", ttl: "1h" },
			prompt_cache_retention: "24h",
		};

		for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
			const rawBody = {
				model: "openai/gpt-5.6-sol",
				...(endpoint === "responses"
					? { input: "hello" }
					: { messages: [{ role: "user", content: "hello" }] }),
				...cacheFields,
			};

			expect(getUnknownTopLevelParams(endpoint, rawBody)).toEqual([]);
			expect(extractRequestedParams(endpoint, rawBody)).toEqual(
				expect.arrayContaining(["cache_control", "prompt_cache_retention"]),
			);
		}
	});

	it("applies provider override rules from code", () => {
		expect(
			resolveProviderParamSupportOverride("cerebras", "presence_penalty"),
		).toBe(false);
		expect(
			resolveProviderParamSupportOverride("openai", "provider_options.openai.context_management"),
		).toBe(true);
		expect(
			resolveProviderParamSupportOverride("cerebras", "reasoning.effort"),
		).toBeUndefined();
	});
});

describe("providerSupportsParam", () => {
	it("honors code-first overrides before metadata", () => {
		const candidate = {
			providerId: "cerebras",
			capabilityParams: {
				presence_penalty: {},
			},
		} as any;

		expect(
			providerSupportsParam(candidate, "presence_penalty", {
				assumeSupportedOnMissingConfig: false,
			}),
		).toBe(false);
	});

	it("falls back to metadata aliases when no override exists", () => {
		const candidate = {
			providerId: "openai",
			capabilityParams: {
				reasoning: {
					effort: {},
				},
			},
		} as any;

		expect(
			providerSupportsParam(candidate, "reasoning.effort", {
				assumeSupportedOnMissingConfig: false,
			}),
		).toBe(true);
	});

	it("does not mark always-supported params as unsupported", () => {
		const candidate = {
			providerId: "openai",
			capabilityParams: {},
		} as any;

		const unsupported = getUnsupportedParamsForProvider({
			endpoint: "responses",
			requestedParams: ["modalities", "temperature"],
			candidate,
			assumeSupportedOnMissingConfig: false,
		});

		expect(unsupported).toEqual(["temperature"]);
	});
});
