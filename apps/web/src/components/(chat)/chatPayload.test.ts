import { describe, it, expect } from "vitest";
import {
	extractImageToolOutput,
	extractResponseImages,
	extractOutputText,
	resolveChatReasoningSummary,
	extractResponseText,
	extractResponseToolCalls,
} from "./chatPayload";

describe("resolveChatReasoningSummary", () => {
	it("uses detailed summaries for OpenAI GPT-5.6 chat models", () => {
		expect(resolveChatReasoningSummary("openai/gpt-5.6-luna-pro")).toBe(
			"detailed",
		);
	});

	it("keeps auto summaries for other chat models", () => {
		expect(resolveChatReasoningSummary("openai/gpt-5.4-nano")).toBe("auto");
	});
});

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

describe("image tool output in Chat", () => {
	const call = (output: unknown) => ({
		type: "function_call",
		name: "phaseo_image_generation",
		call_id: "call_1",
		arguments: "{}",
		status: "completed",
		output: typeof output === "string" ? output : JSON.stringify(output),
	});

	it("shows SVG and GIF images the image tool returned", () => {
		const images = extractResponseImages({
			output: [
				call({ status: "ok", model: "openai/gpt-image-2.6-flare", b64_json: "PHN2Zz48L3N2Zz4=", mime_type: "image/svg+xml" }),
				call({ status: "ok", model: "openai/gpt-image-2.6-flare", b64_json: "R0lGODlh", mime_type: "image/gif" }),
			],
		});
		expect(images.map((image) => image.url)).toEqual([
			"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
			"data:image/gif;base64,R0lGODlh",
		]);
	});

	it("ignores failed calls, other tools and unsafe image types", () => {
		expect(extractImageToolOutput(call({ status: "error", message: "blocked" }))).toBeNull();
		expect(extractImageToolOutput({ ...call({ status: "ok", b64_json: "abc" }), name: "phaseo_web_search" })).toBeNull();
		expect(extractImageToolOutput(call({ status: "ok", b64_json: "abc", mime_type: "text/html" }))?.url).toBe("data:image/png;base64,abc");
		expect(extractImageToolOutput(call({ status: "ok", imageUrl: "javascript:alert(1)" }))).toBeNull();
	});
});
