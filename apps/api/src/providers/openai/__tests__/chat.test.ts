import { describe, expect, it } from "vitest";
import { __testing } from "../endpoints/chat";

describe("OpenAI chat responses request mapping", () => {
	it("omits empty assistant wrapper messages for tool-only follow-up turns", () => {
		const payload = __testing.mapGatewayToOpenAIResponses({
			model: "openai/gpt-5.4-nano",
			stream: false,
			messages: [
				{
					role: "user",
					content: "Use the weather tool and then summarise weather in one concise sentence.",
				},
				{
					role: "assistant",
					content: "",
					tool_calls: [
						{
							id: "call_weather",
							type: "function",
							function: {
								name: "get_weather",
								arguments: "{\"city\":\"London\"}",
							},
						},
					],
				},
				{
					role: "tool",
					tool_call_id: "call_weather",
					content: "{\"city\":\"London\",\"temperature_c\":14,\"condition\":\"Cloudy\"}",
				},
			],
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get weather for a city.",
						parameters: {
							type: "object",
							properties: {
								city: { type: "string" },
							},
							required: ["city"],
						},
					},
				},
			],
		} as any);

		expect(payload.input).toEqual([
			{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "Use the weather tool and then summarise weather in one concise sentence." }],
			},
			{
				type: "function_call",
				id: "call_weather",
				call_id: "call_weather",
				name: "get_weather",
				arguments: "{\"city\":\"London\"}",
			},
			{
				type: "function_call_output",
				call_id: "call_weather",
				output: "{\"city\":\"London\",\"temperature_c\":14,\"condition\":\"Cloudy\"}",
				status: "completed",
			},
		]);
	});
});
