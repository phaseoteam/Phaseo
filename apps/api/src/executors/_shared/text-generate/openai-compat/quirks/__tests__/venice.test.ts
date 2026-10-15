import { describe, expect, it } from "vitest";
import { veniceQuirks } from "../../providers/venice/quirks";

describe("Venice quirks", () => {
	it("preserves Abliterated Large V2 reasoning returned in message.reasoning", () => {
		expect(veniceQuirks.extractReasoning?.({
			choice: { message: { content: "7", reasoning: "Use the tool result." } },
			rawContent: "7",
		})).toEqual({ main: "7", reasoning: ["Use the tool result."] });
	});

	it("prefers reasoning_content when both reasoning fields are populated", () => {
		expect(veniceQuirks.extractReasoning?.({
			choice: { message: { reasoning_content: "canonical", reasoning: "alias" } },
			rawContent: "answer",
		})).toEqual({ main: "answer", reasoning: ["canonical"] });
	});

	it("normalizes fragmented reasoning aliases without changing terminal frames", () => {
		const chunks = [
			{ choices: [{ delta: { reasoning: "Use " } }] },
			{ choices: [{ delta: { reasoning: "the result." } }] },
			{ choices: [{ delta: { content: "7" }, finish_reason: "stop" }] },
			{ choices: [], usage: { completion_tokens: 20 } },
		];
		for (const chunk of chunks) veniceQuirks.transformStreamChunk?.({ chunk } as any);
		expect(chunks[0].choices[0].delta).toMatchObject({
			reasoning_content: "Use ", reasoning_details: [{ type: "text", text: "Use " }],
		});
		expect(chunks[1].choices[0].delta).toMatchObject({
			reasoning_content: "the result.", reasoning_details: [{ type: "text", text: "the result." }],
		});
		expect(chunks[2]).toEqual({ choices: [{ delta: { content: "7" }, finish_reason: "stop" }] });
		expect(chunks[3]).toEqual({ choices: [], usage: { completion_tokens: 20 } });
	});

	it("maps responses input_items to input", () => {
		const request: Record<string, any> = {
			model: "llama-3.2-3b",
			input_items: [{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "hi" }],
			}],
		};

		veniceQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: "llama-3.2-3b",
		});

		expect(Array.isArray(request.input)).toBe(true);
		expect(request.input_items).toBeUndefined();
	});

	it("passes Venice extensions and preserves reasoning output", () => {
		const request: Record<string, any> = { model: "zai-org-glm-5-1", messages: [] };
		veniceQuirks.transformRequest?.({
			request,
			ir: { vendor: { venice: { enable_web_search: "auto", disable_thinking: false } } } as any,
		});
		expect(request.venice_parameters).toEqual({
			enable_web_search: "auto",
			disable_thinking: false,
		});
		expect(veniceQuirks.extractReasoning?.({
			choice: { message: { reasoning_content: "working" } },
			rawContent: "answer",
		})).toEqual({ main: "answer", reasoning: ["working"] });
	});
});
