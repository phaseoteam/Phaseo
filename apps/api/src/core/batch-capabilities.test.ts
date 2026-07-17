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
	});

	it("tracks provider-native mixed-model batch support", () => {
		expect(providerSupportsMultipleModelsPerBatch("anthropic")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("x-ai")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("groq")).toBe(true);
		expect(providerSupportsMultipleModelsPerBatch("together")).toBe(true);

		expect(providerSupportsMultipleModelsPerBatch("openai")).toBe(false);
		expect(providerSupportsMultipleModelsPerBatch("google-ai-studio")).toBe(false);
		expect(providerSupportsMultipleModelsPerBatch("mistral")).toBe(false);
	});

	it("fails closed to OpenAI and accepts an explicit preview provider allowlist", () => {
		expect(resolveBatchPreviewProviderIds(undefined)).toEqual(["openai"]);
		expect(resolveBatchPreviewProviderIds("anthropic, google, unknown")).toEqual([
			"anthropic",
			"google-ai-studio",
		]);
		expect(resolveBatchPreviewProviderIds("*")).toEqual([
			"openai",
			"anthropic",
			"google-ai-studio",
			"mistral",
		]);
		expect(resolveBatchPreviewProviderIds("xai,groq,together")).toEqual(["x-ai", "groq", "together"]);
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
		expect(getBatchProviderCapability("together")?.previewReadiness).toBe("experimental");
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
