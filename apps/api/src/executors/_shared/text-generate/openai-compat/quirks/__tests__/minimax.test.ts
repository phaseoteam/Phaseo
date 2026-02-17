import { describe, expect, it } from "vitest";
import { minimaxQuirks, parseMinimaxInterleavedText } from "../../providers/minimax/quirks";

describe("MiniMax quirks", () => {
	it("normalizes request roles and MiniMax-specific defaults", () => {
		const request: Record<string, any> = {
			messages: [
				{ role: "developer", content: "You are a strict formatter." },
				{ role: "user", content: "hello" },
			],
			tools: [{
				type: "function",
				function: {
					name: "lookup",
					parameters: { type: "object", properties: {} },
				},
			}],
			n: 2,
		};

		minimaxQuirks.transformRequest?.({
			request,
			ir: {} as any,
		});

		expect(request.messages[0].role).toBe("system");
		expect(request.n).toBeUndefined();
		expect(request.reasoning_split).toBe(true);
	});

	it("sets reasoning_split when reasoning is enabled", () => {
		const request: Record<string, any> = {
			messages: [{ role: "user", content: "hello" }],
		};

		minimaxQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.reasoning_split).toBe(true);
	});

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

	it("prefers reasoning_details when extracting reasoning", () => {
		const extracted = minimaxQuirks.extractReasoning?.({
			rawContent: "<think>fallback reasoning</think>Answer text",
			choice: {
				message: {
					reasoning_details: [{
						type: "text",
						text: "reasoning from details",
					}],
				},
			},
		});

		expect(extracted?.main).toBe("Answer text");
		expect(extracted?.reasoning).toEqual(["reasoning from details"]);
	});

	it("fills reasoning_content from reasoning_details in chat completions", () => {
		const response: any = {
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "Final answer",
						reasoning_details: [{
							type: "text",
							text: "step-by-step details",
						}],
					},
				},
			],
		};

		minimaxQuirks.normalizeResponse?.({ response, ir: null as any });

		expect(response.choices[0].message.content).toBe("Final answer");
		expect(response.choices[0].message.reasoning_content).toBe("step-by-step details");
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

	it("normalizes responses output reasoning from reasoning_details", () => {
		const response: any = {
			output: [
				{
					type: "message",
					id: "msg_1",
					status: "completed",
					role: "assistant",
					content: "Final answer",
					reasoning_details: [{
						type: "text",
						text: "detail-reasoning",
					}],
				},
			],
		};

		minimaxQuirks.normalizeResponse?.({ response, ir: null as any });

		expect(response.output).toHaveLength(2);
		expect(response.output[0].type).toBe("reasoning");
		expect(response.output[0].content[0].text).toBe("detail-reasoning");
		expect(response.output[1].type).toBe("message");
		expect(response.output[1].content).toBe("Final answer");
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

	it("maps reasoning_details stream deltas into reasoning_content deltas", () => {
		const accumulated: any = {
			requestId: "req_minimax",
		};

		const first: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {
						reasoning_details: [{
							type: "text",
							text: "reasoning",
						}],
					},
				},
			],
		};
		minimaxQuirks.transformStreamChunk?.({ chunk: first, accumulated });
		expect(first.choices[0].delta.reasoning_content).toBe("reasoning");

		const second: any = {
			object: "chat.completion.chunk",
			choices: [
				{
					index: 0,
					delta: {
						reasoning_details: [{
							type: "text",
							text: "reasoning extended",
						}],
					},
				},
			],
		};
		minimaxQuirks.transformStreamChunk?.({ chunk: second, accumulated });
		expect(second.choices[0].delta.reasoning_content).toBe(" extended");

		const finalChunk: any = {
			object: "chat.completion",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Done.",
					},
					finish_reason: "stop",
				},
			],
		};
		minimaxQuirks.transformStreamChunk?.({ chunk: finalChunk, accumulated });
		expect(finalChunk.choices[0].message.reasoning_content).toBe("reasoning extended");
	});
});
