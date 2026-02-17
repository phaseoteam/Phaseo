// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import { describe, expect, it } from "vitest";
import { xiaomiQuirks } from "../../providers/xiaomi/quirks";

describe("Xiaomi quirks", () => {
	it("adds chat_template_kwargs.enable_thinking when reasoning is enabled", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: true,
			},
		};

		xiaomiQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_kwargs).toEqual({
			enable_thinking: true,
		});
	});

	it("adds chat_template_kwargs.enable_thinking=false when reasoning is disabled", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: false,
			},
		};

		xiaomiQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_kwargs).toEqual({
			enable_thinking: false,
		});
	});

	it("maps developer role to system", () => {
		const request: Record<string, any> = {
			messages: [
				{ role: "developer", content: "format as JSON" },
				{ role: "user", content: "hello" },
			],
		};
		const ir: any = {};

		xiaomiQuirks.transformRequest?.({ request, ir });

		expect(request.messages[0].role).toBe("system");
		expect(request.messages[1].role).toBe("user");
	});

	it("downgrades json_schema to json_object and injects schema instruction", () => {
		const request: Record<string, any> = {
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: {
							answer: { type: "string" },
						},
						required: ["answer"],
					},
				},
			},
			messages: [{ role: "user", content: "Return one answer." }],
		};
		const ir: any = {};

		xiaomiQuirks.transformRequest?.({ request, ir });

		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.messages[0].role).toBe("system");
		expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
	});

	it("extracts reasoning_content into reasoning blocks", () => {
		const result = xiaomiQuirks.extractReasoning?.({
			choice: {
				message: {
					reasoning_content: "thinking",
				},
			},
			rawContent: "answer",
		});

		expect(result).toEqual({
			main: "answer",
			reasoning: ["thinking"],
		});
	});

	it("accumulates streaming reasoning_content and emits reasoning_details on final chunk", () => {
		const accumulated: any = {
			requestId: "req_123",
		};

		xiaomiQuirks.transformStreamChunk?.({
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
					delta: {
						content: "done",
					},
					finish_reason: "stop",
				},
			],
		};

		xiaomiQuirks.transformStreamChunk?.({
			chunk: finalChunk,
			accumulated,
		});

		expect(finalChunk.choices[0].message.reasoning_content).toBe("step1 ");
		expect(finalChunk.choices[0].message.reasoning_details).toEqual([
			{
				id: "req_123-reasoning-0-1",
				index: 0,
				type: "text",
				text: "step1 ",
			},
		]);
	});
});
