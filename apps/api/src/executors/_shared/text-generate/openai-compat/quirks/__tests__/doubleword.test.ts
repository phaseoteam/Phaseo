import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { irToOpenAIChat } from "../../transform-chat";
import { irToOpenAIResponses } from "../../transform";

const ir: IRChatRequest = {
	model: "deepseek/deepseek-v4.1-flash",
	stream: false,
	messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
	reasoning: { effort: "high" },
	serviceTier: "standard",
};

describe("Doubleword request quirks", () => {
	it("uses Responses API fields for realtime reasoning and service tier", () => {
		const request = irToOpenAIResponses(
			ir,
			"deepseek-ai/DeepSeek-V4.1-Flash",
			"doubleword",
		);

		expect(request.input).toBeDefined();
		expect(request.input_items).toBeUndefined();
		expect(request.reasoning).toEqual({ effort: "high" });
		expect(request.service_tier).toBe("priority");
	});

	it("keeps Chat Completions compatible when a caller selects that route", () => {
		const request = irToOpenAIChat(
			ir,
			"deepseek-ai/DeepSeek-V4.1-Flash",
			"doubleword",
		);

		expect(request.reasoning_effort).toBe("high");
		expect(request.service_tier).toBe("priority");
	});
});
