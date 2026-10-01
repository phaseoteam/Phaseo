import { describe, expect, it } from "vitest";

import {
	buildUnsupportedBatchModePayload,
	getBatchProviderCapability,
	providerSupportsMultipleModelsPerBatch,
	resolveBatchPreviewProviderIds,
	resolveBatchInputMode,
	resolveBatchProvidersForMode,
	resolveBatchProvidersFromModel,
	resolveRequestedBatchProviders,
} from "./batch-capabilities";

describe("batch capabilities", () => {
	it("tracks OVHcloud's documented Batch and Files contract", () => {
		const capability = getBatchProviderCapability("ovhcloud");
		expect(capability).toMatchObject({
			status: "active",
			previewReadiness: "validated",
			nativeInputModes: ["file"],
			gatewayInputModes: ["file", "requests"],
			supportsMultipleModelsPerBatch: true,
		});
		expect(capability?.endpoints).toEqual([
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		]);
	});
	it("tracks Alibaba Cloud's OpenAI-compatible Batch and Files contract", () => {
		expect(getBatchProviderCapability("alibaba-cloud")).toMatchObject({
			status: "active",
			previewReadiness: "experimental",
			nativeInputModes: ["file"],
			gatewayInputModes: ["file", "requests"],
			endpoints: [
				{ endpoint: "/v1/chat/completions", mode: "native" },
				{ endpoint: "/v1/embeddings", mode: "native" },
			],
		});
	});
	it("resolves file and requests batch input modes", () => {
		expect(resolveBatchInputMode({ input_file_id: "file_123", endpoint: "/v1/responses" })).toEqual({
			ok: true,
			mode: "file",
		});
		expect(resolveBatchInputMode({ requests: [{ body: { model: "gpt-5.4-nano" } }], endpoint: "/v1/responses" })).toEqual({
			ok: true,
			mode: "requests",
		});
		expect(resolveBatchInputMode({ model: "openai/gpt-5-mini", prompts: ["Hello"] })).toEqual({
			ok: true,
			mode: "requests",
		});
		expect(resolveBatchInputMode({ model: "anthropic/claude-sonnet-4", items: [{ prompt: "Hello" }] })).toEqual({
			ok: true,
			mode: "requests",
		});
		expect(resolveBatchInputMode({ input_file_id: "file_123", requests: [{}] })).toEqual({
			ok: false,
			reason: "ambiguous_batch_input",
		});
		expect(resolveBatchInputMode({ input_file_id: "file_123", prompts: ["Hello"] })).toEqual({
			ok: false,
			reason: "ambiguous_batch_input",
		});
		expect(resolveBatchInputMode({ prompts: ["Hello"], items: [{ prompt: "Hello again" }] })).toEqual({
			ok: false,
			reason: "ambiguous_batch_input",
		});
	});

	it("extracts provider preferences from routing shapes", () => {
		expect(resolveRequestedBatchProviders("anthropic")).toEqual(["anthropic"]);
		expect(resolveRequestedBatchProviders({ only: ["google", "x-ai"] })).toEqual(["google-ai-studio", "x-ai"]);
		expect(resolveRequestedBatchProviders("gemini")).toEqual(["google-ai-studio"]);
		expect(resolveRequestedBatchProviders("xai")).toEqual(["x-ai"]);
		expect(resolveRequestedBatchProviders("moonshot-ai-turbo")).toEqual(["moonshotai"]);
		expect(resolveRequestedBatchProviders({ order: ["openai", "openai"] })).toEqual(["openai"]);
	});

	it("infers batch providers from model ids", () => {
		expect(resolveBatchProvidersFromModel("openai/gpt-5-mini")).toEqual(["openai"]);
		expect(resolveBatchProvidersFromModel("openai/gpt-5.4-nano")).toEqual(["openai"]);
		expect(resolveBatchProvidersFromModel("gpt-5.4-nano")).toEqual(["openai"]);
		expect(resolveBatchProvidersFromModel("gpt-5-mini")).toEqual(["openai"]);
		expect(resolveBatchProvidersFromModel("anthropic/claude-sonnet-4")).toEqual(["anthropic"]);
		expect(resolveBatchProvidersFromModel("claude-sonnet-4")).toEqual(["anthropic"]);
		expect(resolveBatchProvidersFromModel("google/gemini-2.5-flash")).toEqual(["google-ai-studio"]);
		expect(resolveBatchProvidersFromModel("models/gemini-2.5-flash")).toEqual(["google-ai-studio"]);
		expect(resolveBatchProvidersFromModel("mistral-large-latest")).toEqual(["mistral"]);
		expect(resolveBatchProvidersFromModel("x-ai/grok-4")).toEqual(["x-ai"]);
		expect(resolveBatchProvidersFromModel("spacex-ai/grok-4.3")).toEqual(["x-ai"]);
		expect(resolveBatchProvidersFromModel("llama-3.3-70b-versatile")).toEqual(["groq"]);
		expect(resolveBatchProvidersFromModel("meta-llama/Llama-3.3-70B-Instruct-Turbo")).toEqual(["together"]);
		expect(resolveBatchProvidersFromModel("moonshotai/kimi-k2.6")).toEqual(["moonshotai"]);
		expect(resolveBatchProvidersFromModel("kimi-k2.5")).toEqual(["moonshotai"]);
	});

	it("tracks provider-native mixed-model batch support", () => {
		expect(providerSupportsMultipleModelsPerBatch("anthropic")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("x-ai")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("groq")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("together")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("alibaba-cloud")).toBe(true);

		expect(providerSupportsMultipleModelsPerBatch("openai")).toBe(false);
		expect(providerSupportsMultipleModelsPerBatch("google-ai-studio")).toBe(false);
		expect(providerSupportsMultipleModelsPerBatch("mistral")).toBe(false);
		expect(providerSupportsMultipleModelsPerBatch("moonshotai")).toBe(false);
	});

	it("fails closed to validated preview providers even for an explicit allowlist", () => {
		expect(resolveBatchPreviewProviderIds(undefined)).toEqual(["openai"]);
		expect(resolveBatchPreviewProviderIds("anthropic, google, unknown")).toEqual([
			"anthropic",
			"google-ai-studio",
		]);
		expect(resolveBatchPreviewProviderIds("*")).toEqual([
			"openai",
			"ovhcloud",
			"anthropic",
			"google-ai-studio",
			"mistral",
			"moonshotai",
			"together",
			"parasail",
		]);
		expect(resolveBatchPreviewProviderIds("xai,groq,together")).toEqual(["together"]);
		expect(resolveBatchPreviewProviderIds("unknown")).toEqual([]);
	});

	it("separates validated preview providers from experimental and blocked adapters", () => {
		expect(getBatchProviderCapability("anthropic")).toMatchObject({
			previewReadiness: "validated",
			reconciliationMode: "polling",
			submissionRecovery: "manual_review",
		});
		expect(getBatchProviderCapability("google-ai-studio")).toMatchObject({
			previewReadiness: "validated",
			reconciliationMode: "provider_webhook_with_polling",
		});
		expect(getBatchProviderCapability("x-ai")?.previewReadiness).toBe("blocked");
		expect(getBatchProviderCapability("groq")?.previewReadiness).toBe("experimental");
		expect(getBatchProviderCapability("together")?.previewReadiness).toBe("validated");
		expect(getBatchProviderCapability("alibaba-cloud")?.previewReadiness).toBe("experimental");
		expect(getBatchProviderCapability("mistral-eu")).toMatchObject({
			status: "planned",
			previewReadiness: "blocked",
			nativeInputModes: [],
			gatewayInputModes: [],
		});
		expect(getBatchProviderCapability("scaleway")).toMatchObject({
			status: "planned",
			previewReadiness: "blocked",
			nativeInputModes: ["file"],
			gatewayInputModes: [],
			endpoints: [{ endpoint: "/v1/chat/completions", mode: "native" }],
		});
		for (const providerId of ["google-vertex", "google-vertex-eu"]) {
			expect(getBatchProviderCapability(providerId)).toMatchObject({
				status: "planned",
				previewReadiness: "blocked",
				nativeInputModes: ["file"],
				gatewayInputModes: [],
				endpoints: [
					{ endpoint: "/v1/generateContent", mode: "native" },
					{ endpoint: "/v1/embeddings", mode: "native" },
				],
			});
		}
		expect(getBatchProviderCapability("moonshot-ai")).toMatchObject({
			providerId: "moonshotai",
			status: "active",
			previewReadiness: "validated",
			nativeInputModes: ["file"],
			gatewayInputModes: ["file", "requests"],
			submissionRecovery: "metadata_lookup",
		});
		expect(getBatchProviderCapability("nebius-token-factory")).toMatchObject({
			status: "planned",
			previewReadiness: "blocked",
			nativeInputModes: [],
			gatewayInputModes: [],
			endpoints: [],
		});
		expect(getBatchProviderCapability("parasail")).toMatchObject({
			status: "active",
			previewReadiness: "validated",
			nativeInputModes: ["file"],
			gatewayInputModes: ["file", "requests"],
			endpoints: [
				{ endpoint: "/v1/chat/completions", mode: "native" },
				{ endpoint: "/v1/embeddings", mode: "native" },
			],
		});
	});

	it("describes native and translated endpoint support per provider", () => {
		expect(getBatchProviderCapability("openai")?.endpoints).toEqual([
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
			{ endpoint: "/v1/completions", mode: "native" },
			{ endpoint: "/v1/moderations", mode: "native" },
			{ endpoint: "/v1/images/generations", mode: "native" },
			{ endpoint: "/v1/images/edits", mode: "native" },
			{ endpoint: "/v1/videos", mode: "native" },
		]);
		expect(getBatchProviderCapability("anthropic")?.endpoints).toContainEqual({
			endpoint: "/v1/chat/completions",
			mode: "translated",
		});
		expect(getBatchProviderCapability("google-ai-studio")?.endpoints).toContainEqual({
			endpoint: "/v1/generateContent",
			mode: "native",
		});
		expect(getBatchProviderCapability("x-ai")?.endpoints.map((entry) => entry.endpoint)).toEqual([
			"/v1/chat/completions", "/v1/responses", "/v1/images/generations", "/v1/images/edits",
			"/v1/videos/generations", "/v1/videos", "/v1/videos/edits", "/v1/videos/extensions",
		]);
		expect(getBatchProviderCapability("mistral")?.endpoints.map((entry) => entry.endpoint)).toEqual([
			"/v1/chat/completions",
			"/v1/embeddings",
			"/v1/fim/completions",
			"/v1/moderations",
			"/v1/chat/moderations",
			"/v1/ocr",
			"/v1/classifications",
			"/v1/chat/classifications",
			"/v1/conversations",
			"/v1/audio/transcriptions",
		]);
		expect(getBatchProviderCapability("moonshotai")?.endpoints).toEqual([
			{ endpoint: "/v1/chat/completions", mode: "native" },
		]);
	});

	it("returns docs-rich unsupported mode payloads", () => {
		const providers = resolveBatchProvidersForMode({
			mode: "file",
			requestedProviders: ["anthropic"],
		});
		expect(providers).toEqual([]);
		const payload = buildUnsupportedBatchModePayload({
			mode: "file",
			requestedProviders: ["anthropic"],
		});
		expect((payload.error as any).reason).toBe("batch_input_mode_not_supported");
		expect((payload.error as any).providers[0].documentation_url).toContain("anthropic");
	});
});
