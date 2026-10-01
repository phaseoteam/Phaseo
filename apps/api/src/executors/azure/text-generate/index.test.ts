import { describe, expect, it } from "vitest";
import { normalizeAzureChatRequest, resolveAzureTextUrl, shouldUseAzureResponsesRoute } from "./index";
import { azureMaiUrl } from "@providers/azure/config";

describe("azure text-generate executor", () => {
	it("uses the native MAI endpoint and Chat contract for MAI text deployments", () => {
		expect(azureMaiUrl("chat/completions", "https://resource.openai.azure.com/openai/v1")).toBe("https://resource.services.ai.azure.com/mai/v1/chat/completions");
		expect(azureMaiUrl("chat/completions", "https://resource.services.ai.azure.com/mai/v1")).toBe("https://resource.services.ai.azure.com/mai/v1/chat/completions");
		expect(shouldUseAzureResponsesRoute({ protocol: "openai.responses", providerModelSlug: "MAI-Thinking-1", ir: { model: "microsoft/mai-thinking-1" } as any })).toBe(false);
	});
	it("uses max_completion_tokens for Azure GPT-5 chat deployments", () => {
		const request = normalizeAzureChatRequest(
			{
				model: "gpt-5.6-luna",
				messages: [{ role: "user", content: "Hi" }],
				max_tokens: 64,
			},
			{
				providerModelSlug: "gpt-5.6-luna",
				ir: { model: "openai/gpt-5.6-luna" } as any,
			},
		);

		expect(request.max_tokens).toBeUndefined();
		expect(request.max_completion_tokens).toBe(64);
	});

	it("preserves max_tokens for non-GPT-5 Azure chat deployments", () => {
		const request = normalizeAzureChatRequest(
			{
				model: "gpt-4o",
				messages: [{ role: "user", content: "Hi" }],
				max_tokens: 64,
			},
			{
				providerModelSlug: "gpt-4o",
				ir: { model: "openai/gpt-4o" } as any,
			},
		);

		expect(request.max_tokens).toBe(64);
		expect(request.max_completion_tokens).toBeUndefined();
	});

	it("routes Azure GPT-5.6 non-Pro deployments through the Responses API", () => {
		expect(shouldUseAzureResponsesRoute({
			providerModelSlug: "gpt-5.6-luna",
			ir: { model: "openai/gpt-5.6-luna" } as any,
		})).toBe(true);
		expect(shouldUseAzureResponsesRoute({
			providerModelSlug: "gpt-5.6-sol",
			ir: { model: "openai/gpt-5.6-sol" } as any,
		})).toBe(true);
		expect(shouldUseAzureResponsesRoute({
			providerModelSlug: "gpt-5.6-terra",
			ir: { model: "openai/gpt-5.6-terra" } as any,
		})).toBe(true);
	});

	it("keeps Azure GPT-5.6 Pro model IDs off the non-Pro Azure deployment route", () => {
		expect(shouldUseAzureResponsesRoute({
			providerModelSlug: "gpt-5.6-luna-pro",
			ir: { model: "openai/gpt-5.6-luna-pro" } as any,
		})).toBe(false);
	});

	it("selects Chat or Responses from the public protocol rather than the model name", () => {
		expect(shouldUseAzureResponsesRoute({
			protocol: "openai.responses",
			providerModelSlug: "gpt-4o",
			ir: { model: "openai/gpt-4o" } as any,
		})).toBe(true);
		expect(shouldUseAzureResponsesRoute({
			protocol: "openai.chat.completions",
			providerModelSlug: "gpt-5.6-sol",
			ir: { model: "openai/gpt-5.6-sol" } as any,
		})).toBe(false);
	});

	it("builds v1 and legacy deployment-scoped text routes", () => {
		expect(resolveAzureTextUrl({ route: "chat", deployment: "my-deployment", baseUrl: "https://resource.openai.azure.com", apiVersion: "v1" }))
			.toBe("https://resource.openai.azure.com/openai/v1/chat/completions");
		expect(resolveAzureTextUrl({ route: "responses", deployment: "my-deployment", baseUrl: "https://resource.openai.azure.com", apiVersion: "preview" }))
			.toBe("https://resource.openai.azure.com/openai/v1/responses?api-version=preview");
		expect(resolveAzureTextUrl({ route: "chat", deployment: "my-deployment", baseUrl: "https://resource.openai.azure.com", apiVersion: "2024-10-21" }))
			.toBe("https://resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21");
	});
});
