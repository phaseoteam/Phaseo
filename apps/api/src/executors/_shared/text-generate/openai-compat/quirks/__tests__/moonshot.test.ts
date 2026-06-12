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
});
