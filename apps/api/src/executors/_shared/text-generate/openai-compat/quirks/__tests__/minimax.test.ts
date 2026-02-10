import { describe, expect, it } from "vitest";
import { minimaxQuirks, parseMinimaxInterleavedText } from "../../providers/minimax/quirks";

describe("MiniMax quirks", () => {
	it("parses interleaved thinking and invoke tool calls", () => {
		const parsed = parseMinimaxInterleavedText(
			[
				"<think>reasoning step</think>",
				"<invoke name=\"get_weather\">",
				"<parameter name=\"city\">London</parameter>",
				"</invoke>",
			].join(""),
		);

		expect(parsed.reasoning).toEqual(["reasoning step"]);
		expect(parsed.main).toBe("");
		expect(parsed.toolCalls).toHaveLength(1);
		expect(parsed.toolCalls[0].name).toBe("get_weather");
		expect(parsed.toolCalls[0].arguments).toBe("{\"city\":\"London\"}");
	});

	it("normalizes chat responses with XML fallback tool calls", () => {
		const response: any = {
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "<think>plan</think><invoke name=\"get_weather\"><parameter name=\"city\">London</parameter></invoke>",
					},
				},
			],
		};

		minimaxQuirks.normalizeResponse?.({ response, ir: null as any });

		const choice = response.choices[0];
		expect(choice.finish_reason).toBe("tool_calls");
		expect(choice.message.content).toBe("");
		expect(choice.message.reasoning_content).toContain("plan");
		expect(Array.isArray(choice.message.tool_calls)).toBe(true);
		expect(choice.message.tool_calls[0].function.name).toBe("get_weather");
		expect(choice.message.tool_calls[0].function.arguments).toBe("{\"city\":\"London\"}");
	});

	it("normalizes responses output into reasoning + function_call items", () => {
		const response: any = {
			output: [
				{
					type: "message",
					id: "msg_1",
					status: "completed",
					role: "assistant",
					content: [
						{
							type: "output_text",
							text: "<think>plan</think><invoke name=\"get_weather\"><parameter name=\"city\">London</parameter></invoke>",
						},
					],
				},
			],
		};

		minimaxQuirks.normalizeResponse?.({ response, ir: null as any });

		expect(response.output.map((item: any) => item.type)).toEqual(["reasoning", "function_call"]);
		expect(response.output[1].name).toBe("get_weather");
		expect(response.output[1].arguments).toBe("{\"city\":\"London\"}");
	});

	it("hydrates tool_calls on final stream chunk when XML fallback appears", () => {
		const accumulated: any = {
			requestId: "req_minimax",
		};

		const chunk1: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {
						content: "<think>thinking</think>",
					},
				},
			],
		};
		minimaxQuirks.transformStreamChunk?.({ chunk: chunk1, accumulated });
		expect(chunk1.choices[0].delta.reasoning_content).toContain("thinking");

		const finalChunk: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {
						content: "<invoke name=\"get_weather\"><parameter name=\"city\">London</parameter></invoke>",
					},
					finish_reason: "stop",
				},
			],
		};
		minimaxQuirks.transformStreamChunk?.({ chunk: finalChunk, accumulated });

		const choice = finalChunk.choices[0];
		expect(choice.finish_reason).toBe("tool_calls");
		expect(choice.message.tool_calls[0].function.name).toBe("get_weather");
		expect(choice.delta.tool_calls[0].function.arguments).toBe("{\"city\":\"London\"}");
	});
});
