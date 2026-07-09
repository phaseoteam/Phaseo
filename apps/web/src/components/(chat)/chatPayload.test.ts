import {
	extractOutputText,
	extractResponseText,
	extractResponseToolCalls,
} from "./chatPayload";

describe("extractResponseToolCalls", () => {
	it("extracts Responses function calls", () => {
		const calls = extractResponseToolCalls({
			output: [
				{
					type: "function_call",
					call_id: "call_weather_1",
					name: "get_weather",
					arguments: "{\"city\":\"SF\"}",
					status: "completed",
				},
			],
		});

		expect(calls).toEqual([
			{
				id: "call_weather_1",
				type: "function_call",
				name: "get_weather",
				status: "completed",
				input: { city: "SF" },
				inputText: "{\"city\":\"SF\"}",
			},
		]);
	});

	it("extracts chat completion tool calls", () => {
		const calls = extractResponseToolCalls({
			choices: [
				{
					message: {
						tool_calls: [
							{
								id: "call_search_1",
								type: "function",
								function: {
									name: "web_search",
									arguments: "{\"query\":\"poolside release\"}",
								},
							},
						],
					},
				},
			],
		});

		expect(calls).toEqual([
			{
				id: "call_search_1",
				type: "function",
				name: "web_search",
				status: "completed",
				input: { query: "poolside release" },
				inputText: "{\"query\":\"poolside release\"}",
			},
		]);
	});

	it("extracts server tool output items", () => {
		const calls = extractResponseToolCalls({
			response: {
				output: [
					{
						type: "web_search_call",
						id: "ws_1",
						status: "in_progress",
						query: "laguna xs 2.1",
					},
				],
			},
		});

		expect(calls).toEqual([
			{
				id: "ws_1",
				type: "web_search_call",
				name: "web_search_call",
				status: "running",
				inputText: "laguna xs 2.1",
			},
		]);
	});

	it("ignores unnamed generic Responses tool_call items", () => {
		const calls = extractResponseToolCalls({
			output: [
				{
					type: "function_call",
					call_id: "call_datetime_1",
					name: "gateway_datetime",
					arguments: "{\"timezones\":[\"UTC\"]}",
					status: "completed",
				},
				{
					type: "tool_call",
					call_id: "call_datetime_1_shadow",
					input: "{\"timezones\":[\"UTC\"]}",
					status: "completed",
				},
			],
		});

		expect(calls).toEqual([
			{
				id: "call_datetime_1",
				type: "function_call",
				name: "gateway_datetime",
				status: "completed",
				input: { timezones: ["UTC"] },
				inputText: "{\"timezones\":[\"UTC\"]}",
			},
		]);
	});

	it("ignores named generic Responses tool_call shadows", () => {
		const calls = extractResponseToolCalls({
			output: [
				{
					type: "function_call",
					call_id: "call_datetime_1",
					name: "gateway_datetime",
					arguments: "{\"timezones\":[\"UTC\"]}",
					status: "completed",
				},
				{
					type: "tool_call",
					call_id: "call_datetime_1_shadow",
					name: "tool_call",
					input: "{\"timezones\":[\"UTC\"]}",
					status: "completed",
				},
			],
		});

		expect(calls.map((call) => call.name)).toEqual(["gateway_datetime"]);
	});
});

describe("extractResponseText", () => {
	it("omits reasoning text from Responses message content", () => {
		const text = extractResponseText({
			output: [
				{
					type: "message",
					content: [
						{ type: "reasoning_text", text: "private chain" },
						{ type: "output_text", text: "Final answer." },
					],
				},
			],
		});

		expect(text).toBe("Final answer.");
	});

	it("concatenates text from multiple final message items", () => {
		const text = extractOutputText([
			{
				type: "message",
				content: [{ type: "output_text", text: "First. " }],
			},
			{
				type: "message",
				content: [{ type: "text", text: "Second." }],
			},
		]);

		expect(text).toBe("First. Second.");
	});
});
