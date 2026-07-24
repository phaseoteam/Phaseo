import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { createSyntheticResponsesStreamFromIR } from "./synthetic-responses-stream";

describe("createSyntheticResponsesStreamFromIR", () => {
	it("emits visible output events for Responses consumers", async () => {
		const response: IRChatResponse = {
			id: "req_synthetic",
			created: 1,
			model: "gemini-3.5-flash-lite",
			provider: "google-ai-studio",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "GEMINI_SYNTHETIC_OK" }],
				},
				finishReason: "stop",
			}],
		};
		const reader = createSyntheticResponsesStreamFromIR(response).getReader();
		const decoder = new TextDecoder();
		let output = "";
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			output += decoder.decode(next.value, { stream: true });
		}

		expect(output).toContain("response.output_text.delta");
		expect(output).toContain("GEMINI_SYNTHETIC_OK");
		expect(output).toContain("response.completed");
	});
});
