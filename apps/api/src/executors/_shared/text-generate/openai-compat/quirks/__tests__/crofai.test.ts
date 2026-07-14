import { describe, expect, it } from "vitest";
import { crofAIQuirks } from "../../providers/crofai/quirks";

describe("CrofAI quirks", () => {
	it("normalizes K2.7 Code request fields to Moonshot-compatible constraints", () => {
		const request: Record<string, any> = {
			model: "moonshotai/kimi-k2.7-code",
			messages: [{ role: "user", content: "hi" }],
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get weather",
						parameters: { type: "object", properties: {} },
					},
				},
			],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			thinking: { type: "disabled" },
			temperature: 0.2,
			top_p: 0.5,
			frequency_penalty: 0.3,
			presence_penalty: -0.2,
		};

		crofAIQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.temperature).toBeUndefined();
		expect(request.top_p).toBeUndefined();
		expect(request.frequency_penalty).toBeUndefined();
		expect(request.presence_penalty).toBeUndefined();
		expect(request.tool_choice).toBe("auto");
	});

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
