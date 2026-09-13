import { describe, expect, it } from "vitest";
import {
	extractRequestedParams,
	getUnknownTopLevelParams,
	getUnsupportedParamsForProvider,
	providerParamSupportStatus,
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
		expect(isAlwaysSupportedParam("messages", "max_tokens")).toBe(true);
		expect(isAlwaysSupportedParam("responses", "temperature")).toBe(false);
	});

	it("applies provider override rules from code", () => {
		expect(
			resolveProviderParamSupportOverride("cohere", "stream_options"),
		).toBe(false);
		expect(
			resolveProviderParamSupportOverride("openai", "provider_options.openai.context_management"),
		).toBe(true);
		expect(
			resolveProviderParamSupportOverride("cerebras", "reasoning.effort"),
		).toBeUndefined();
	});

	it("accepts documented AION chat parameters", () => {
		const body = {
			model: "aion-labs/aion-3.0",
			messages: [{ role: "user", content: "Hello" }],
			metadata: { request: "catalog-test" },
			reasoning_split: true,
		};

		expect(getUnknownTopLevelParams("chat.completions", body)).toEqual([]);
		expect(extractRequestedParams("chat.completions", body)).toEqual([
			"metadata",
			"reasoning_split",
		]);
	});

	it("accepts OpenAI-compatible stream options on chat completions", () => {
		const body = {
			model: "openai/gpt-5.4-nano",
			messages: [{ role: "user", content: "Hello" }],
			store: false,
			stream: true,
			stream_options: { include_usage: true },
		};

		expect(getUnknownTopLevelParams("chat.completions", body)).toEqual([]);
		expect(extractRequestedParams("chat.completions", body)).toEqual([]);
	});

	it("extracts documented AION responses parameters", () => {
		const body = {
			model: "aion-labs/aion-3.0",
			input: "Hello",
			metadata: { request: "catalog-test" },
			reasoning_split: true,
		};

		expect(getUnknownTopLevelParams("responses", body)).toEqual([]);
		expect(extractRequestedParams("responses", body)).toEqual([
			"metadata",
			"reasoning_split",
		]);
	});

	it("recognizes OpenAI prompt cache options on Responses requests", () => {
		const body = {
			model: "openai/gpt-6-astra",
			input: "Hello",
			prompt_cache_options: { mode: "explicit", ttl: "30m" },
		};

		expect(getUnknownTopLevelParams("responses", body)).toEqual([]);
		expect(extractRequestedParams("responses", body)).toContain("prompt_cache_options");
	});
});

describe("providerSupportsParam", () => {
	it("distinguishes unknown metadata from explicit unsupported overrides", () => {
		expect(
			providerParamSupportStatus(
				{ providerId: "openai", capabilityParams: {} } as any,
				"temperature",
			),
		).toBe("unknown");
		expect(
			providerParamSupportStatus(
				{ providerId: "cerebras", capabilityParams: {} } as any,
				"presence_penalty",
			),
		).toBe("unsupported");
	});

	it("keeps provider_options scoped to the named provider", () => {
		expect(
			providerParamSupportStatus(
				{ providerId: "anthropic", capabilityParams: {} } as any,
				"provider_options.openai.context_management",
			),
		).toBe("unsupported");
	});

	it("honors code-first overrides before metadata", () => {
		const candidate = {
			providerId: "cohere",
			capabilityParams: {
				stream_options: {},
			},
		} as any;

		expect(
			providerSupportsParam(candidate, "stream_options", {
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

	it("recognizes Baseten reasoning effort through its canonical capability path", () => {
		const candidate = {
			providerId: "baseten",
			capabilityParams: {
				"reasoning.effort": {},
			},
		} as any;

		expect(
			providerSupportsParam(candidate, "reasoning.effort", {
				assumeSupportedOnMissingConfig: false,
			}),
		).toBe(true);
	});

	it("does not mark always-supported or unknown params as unsupported", () => {
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

		expect(unsupported).toEqual([]);
	});
});
