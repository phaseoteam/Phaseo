import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import {
	buildEmptyResponseDiagnostics,
	emptyResponseMessage,
	hasUsableIRChatResponse,
} from "./empty-response";

function response(overrides: Partial<IRChatResponse>): IRChatResponse {
	return {
		id: "req_empty",
		created: 0,
		model: "test/model",
		provider: "test-provider",
		choices: [],
		...overrides,
	};
}

describe("empty response diagnostics", () => {
	it("classifies reasoning-only output without retaining its contents", () => {
		const ir = response({
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "reasoning_text", text: "private reasoning" }],
				},
				finishReason: "length",
			}],
			usage: { inputTokens: 6, outputTokens: 27, reasoningTokens: 29, totalTokens: 35 },
		});

		expect(hasUsableIRChatResponse(ir)).toBe(true);
		const diagnostics = buildEmptyResponseDiagnostics(ir);
		expect(diagnostics).toEqual({
			reason: "reasoning_only",
			choice_count: 1,
			content_part_types: ["reasoning_text"],
			finish_reasons: ["length"],
			reasoning_part_count: 1,
			reasoning_character_count: 17,
			visible_part_count: 0,
			tool_call_count: 0,
			usage: { output_tokens: 27, reasoning_tokens: 29, total_tokens: 35 },
		});
		expect(JSON.stringify(diagnostics)).not.toContain("private reasoning");
		expect(emptyResponseMessage(diagnostics)).toContain("Increase max_tokens");
	});

	it.each(["", "   "])("rejects empty reasoning %j", (text) => {
		expect(hasUsableIRChatResponse(response({
			choices: [{
				index: 0,
				message: { role: "assistant", content: [{ type: "reasoning_text", text }] },
				finishReason: "stop",
			}],
		}))).toBe(false);
	});

	it("treats a refusal as usable user-facing output", () => {
		const ir = response({
			choices: [{
				index: 0,
				message: { role: "assistant", content: [], refusal: "I cannot help with that." },
				finishReason: "content_filter",
			}],
		});

		expect(hasUsableIRChatResponse(ir)).toBe(true);
	});

	it("classifies a response with no choices", () => {
		const diagnostics = buildEmptyResponseDiagnostics(response({ choices: [] }));
		expect(diagnostics.reason).toBe("no_choices");
		expect(diagnostics.choice_count).toBe(0);
	});
});
