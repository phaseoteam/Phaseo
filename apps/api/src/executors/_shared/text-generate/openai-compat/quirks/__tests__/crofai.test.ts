import { describe, expect, it } from "vitest";
import { crofAIQuirks } from "../../providers/crofai/quirks";

describe("CrofAI quirks", () => {
	it("extracts reasoning_content into reasoning blocks", () => {
		const result = crofAIQuirks.extractReasoning?.({
			choice: {
				message: {
					reasoning_content: "thinking aloud",
				},
			},
			rawContent: "",
		});

		expect(result).toEqual({
			main: "",
			reasoning: ["thinking aloud"],
		});
	});

	it("accumulates streaming reasoning_content and emits reasoning_details on final chunk", () => {
		const accumulated: any = {
			requestId: "req_crof",
		};

		crofAIQuirks.transformStreamChunk?.({
			chunk: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: 0,
						delta: {
							reasoning_content: "step1 ",
						},
					},
				],
			},
			accumulated,
		});

		const finalChunk: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {},
					finish_reason: "length",
				},
			],
		};

		crofAIQuirks.transformStreamChunk?.({
			chunk: finalChunk,
			accumulated,
		});

		expect(finalChunk.choices[0].message.reasoning_content).toBe("step1 ");
		expect(finalChunk.choices[0].message.reasoning_details).toEqual([
			{
				id: "req_crof-reasoning-0-1",
				index: 0,
				type: "text",
				text: "step1 ",
			},
		]);
	});

	it("backfills reasoning_details when only reasoning_content is present", () => {
		const response: any = {
			choices: [
				{
					message: {
						content: "",
						reasoning_content: "hidden reasoning",
					},
				},
			],
		};

		crofAIQuirks.normalizeResponse?.({ response, ir: null as any });

		expect(response.choices[0].message.reasoning_details).toEqual([
			{
				id: "crofai-reasoning-1",
				index: 0,
				type: "text",
				text: "hidden reasoning",
			},
		]);
	});
});
