import { describe, expect, it } from "vitest";
import { moonshotQuirks } from "../../providers/moonshot-ai/quirks";

describe("Moonshot quirks", () => {
	it("rewrites developer role and downgrades json_schema payloads", () => {
		const request: Record<string, any> = {
			model: "moonshot-v1-8k",
			messages: [
				{ role: "developer", content: "Respond in strict JSON." },
				{ role: "user", content: "Give one city." },
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: {
							city: { type: "string" },
						},
						required: ["city"],
					},
				},
			},
		};

		moonshotQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.messages[0].role).toBe("system");
		expect(request.response_format).toEqual({ type: "json_object" });
		expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
	});

	it("normalizes K2.7 Code request fields to Moonshot's documented constraints", () => {
		const request: Record<string, any> = {
			model: "kimi-k2.7-code",
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

		moonshotQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.temperature).toBeUndefined();
		expect(request.top_p).toBeUndefined();
		expect(request.frequency_penalty).toBeUndefined();
		expect(request.presence_penalty).toBeUndefined();
		expect(request.tool_choice).toBe("auto");
	});

	it("normalizes K3 reasoning, output limit, video, and fixed parameters", () => {
		const request: Record<string, any> = {
			model: "kimi-k3",
			messages: [{
				role: "user",
				content: [{
					type: "input_video",
					video_url: { url: "ms://file_123" },
				}],
			}],
			thinking: { type: "disabled" },
			max_tokens: 131072,
			temperature: 0.2,
			top_p: 0.5,
			frequency_penalty: 0.3,
			presence_penalty: -0.2,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					strict: true,
					schema: { type: "object", additionalProperties: false },
				},
			},
		};

		moonshotQuirks.transformRequest?.({
			request,
			ir: { reasoning: { effort: "low" } } as any,
		});

		expect(request.reasoning_effort).toBe("max");
		expect(request.thinking).toBeUndefined();
		expect(request.max_completion_tokens).toBe(131072);
		expect(request.max_tokens).toBeUndefined();
		expect(request.temperature).toBeUndefined();
		expect(request.top_p).toBeUndefined();
		expect(request.frequency_penalty).toBeUndefined();
		expect(request.presence_penalty).toBeUndefined();
		expect(request.messages[0].content[0].type).toBe("video_url");
		expect(request.response_format.type).toBe("json_schema");
		expect(request.response_format.json_schema.strict).toBe(true);
	});

	it("extracts K3 reasoning_content for multi-turn continuity", () => {
		const extracted = moonshotQuirks.extractReasoning?.({
			choice: {
				message: {
					content: "final answer",
					reasoning_content: "private chain",
				},
			},
			rawContent: "final answer",
		});

		expect(extracted).toEqual({
			main: "final answer",
			reasoning: ["private chain"],
		});
	});
});
