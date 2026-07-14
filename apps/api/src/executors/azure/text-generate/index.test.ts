import { describe, expect, it } from "vitest";
import { normalizeAzureChatRequest, shouldUseAzureResponsesRoute } from "./index";

describe("azure text-generate executor", () => {
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
});
