import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { applyGoogleOutputTokenFallback, applyOpenAIUsageFallback } from "./usage-fallback";

describe("google usage fallback", () => {
	it("estimates output tokens when content exists but outputTokens is zero", () => {
		const ir: IRChatResponse = {
			id: "req_1",
			created: 1,
			model: "gemini-test",
			provider: "google-ai-studio",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "hello world" }],
				},
				finishReason: "stop",
			}],
			usage: {
				inputTokens: 10,
				outputTokens: 0,
				totalTokens: 10,
			},
		};

		const result = applyGoogleOutputTokenFallback(ir);
		expect(result.applied).toBe(true);
		expect(ir.usage?.outputTokens).toBeGreaterThan(0);
		expect(ir.usage?.totalTokens).toBeGreaterThan(ir.usage?.inputTokens ?? 0);
	});

	it("does not override non-zero output tokens", () => {
		const ir: IRChatResponse = {
			id: "req_2",
			created: 1,
			model: "gemini-test",
			provider: "google-ai-studio",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "hello" }],
				},
				finishReason: "stop",
			}],
			usage: {
				inputTokens: 10,
				outputTokens: 5,
				totalTokens: 15,
			},
		};

		const result = applyGoogleOutputTokenFallback(ir);
		expect(result.applied).toBe(false);
		expect(ir.usage?.outputTokens).toBe(5);
		expect(ir.usage?.totalTokens).toBe(15);
	});

	it("hydrates OpenAI usage shape from fallback values", () => {
		const usage: any = {};
		applyOpenAIUsageFallback(usage, 20, 8, 28);
		expect(usage.prompt_tokens).toBe(20);
		expect(usage.completion_tokens).toBe(8);
		expect(usage.total_tokens).toBe(28);
	});
});
