import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { normalizeIRForProvider } from "./normalize";

function baseIr(overrides: Partial<IRChatRequest> = {}): IRChatRequest {
	return {
		model: "openai/gpt-5-nano",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		...overrides,
	};
}

describe("normalizeIRForProvider", () => {
	it("clamps anthropic temperature and fills default maxTokens", () => {
		const ir = baseIr({
			model: "anthropic/claude-sonnet-4",
			temperature: 1.6,
		});

		const normalized = normalizeIRForProvider(ir, "anthropic", "openai.chat.completions");

		expect(normalized.temperature).toBe(1);
		expect(normalized.maxTokens).toBe(4096);
	});

	it("uses capability range metadata to clamp numeric params", () => {
		const ir = baseIr({
			temperature: 0.1,
			topP: 0.95,
			reasoning: { maxTokens: 4000 },
		});

		const normalized = normalizeIRForProvider(ir, "openai", "openai.chat.completions", {
			capabilityParams: {
				temperature: { provider_min: 0.2, provider_max: 0.6 },
				top_p: { provider_min: 0.2, provider_max: 0.8 },
				"reasoning.max_tokens": { provider_min: 0, provider_max: 1024 },
			},
		});

		expect(normalized.temperature).toBe(0.2);
		expect(normalized.topP).toBe(0.8);
		expect(normalized.reasoning?.maxTokens).toBe(1024);
	});

	it("defaults OpenAI reasoning.summary to auto when omitted", () => {
		const ir = baseIr({
			reasoning: { effort: "high" },
		});

		const normalized = normalizeIRForProvider(ir, "openai", "openai.responses");
		expect(normalized.reasoning?.summary).toBe("auto");
		expect(normalized.reasoning?.effort).toBe("high");
	});

	it("clamps unsupported OpenAI reasoning effort by model family", () => {
		const ir = baseIr({
			model: "openai/gpt-5-nano",
			reasoning: { effort: "none" },
		});

		const normalized = normalizeIRForProvider(ir, "openai", "openai.responses");
		expect(normalized.reasoning?.effort).toBe("minimal");
	});
});
