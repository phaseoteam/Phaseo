import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";

function makeSseResponse(frames: Array<{ event?: string; data: any } | "[DONE]">): Response {
	const lines = frames.map((frame) => {
		if (frame === "[DONE]") {
			return "data: [DONE]\n\n";
		}
		const eventLine = frame.event ? `event: ${frame.event}\n` : "";
		return `${eventLine}data: ${JSON.stringify(frame.data)}\n\n`;
	});
	return new Response(lines.join(""), {
		headers: { "Content-Type": "text/event-stream" },
	});
}

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return await new Response(stream).text();
}

function baseArgs(overrides?: Record<string, any>): any {
	return {
		ir: {
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			model: "test-model",
			stream: true,
		},
		requestId: "req_stream_test",
		teamId: "team_test",
		providerId: "deepseek",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
		...overrides,
	};
}

describe("resolveStreamForProtocol", () => {
	it("converts chat stream to responses stream for /responses protocol", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_1",
					object: "chat.completion.chunk",
					created: 1710000000,
					model: "test-model",
					choices: [{ index: 0, delta: { content: "Hello " } }],
				},
			},
			{
				data: {
					id: "chatcmpl_1",
					object: "chat.completion.chunk",
					created: 1710000000,
					model: "test-model",
					choices: [{ index: 0, delta: { content: "world" }, finish_reason: "stop" }],
					usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		expect(output).toContain("event: response.created");
		expect(output).toContain("event: response.completed");
		expect(output).toContain("\"type\":\"message\"");
	});

	it("converts responses stream to anthropic messages stream for /messages protocol", async () => {
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: {
					response: {
						id: "resp_1",
						created_at: 1710000001,
						model: "test-model",
					},
				},
			},
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_1",
						object: "response",
						created_at: 1710000001,
						model: "test-model",
						status: "completed",
						output: [
							{
								type: "message",
								role: "assistant",
								content: [{ type: "output_text", text: "Hello world" }],
							},
							{
								type: "function_call",
								call_id: "call_1",
								name: "lookup",
								arguments: "{\"city\":\"SF\"}",
							},
						],
						usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
					},
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				endpoint: "messages",
				protocol: "anthropic.messages",
			}),
			"responses",
		);

		const output = await readStreamText(stream);
		expect(output).toContain("event: message_start");
		expect(output).toContain("event: content_block_start");
		expect(output).toContain("\"type\":\"tool_use\"");
		expect(output).toContain("\"stop_reason\":\"tool_use\"");
		expect(output).toContain("event: message_stop");
	});

	it("converts responses function-call stream events to chat tool_call deltas", async () => {
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: {
					response: {
						id: "resp_fc_1",
						created_at: 1710000002,
						model: "test-model",
					},
				},
			},
			{
				event: "response.output_item.added",
				data: {
					output_index: 0,
					item: {
						type: "function_call",
						id: "fc_item_1",
						call_id: "call_weather_1",
						name: "get_weather",
						arguments: "",
					},
				},
			},
			{
				event: "response.function_call_arguments.delta",
				data: {
					item_id: "call_weather_1",
					output_index: 0,
					delta: "{\"city\":\"SF\"}",
				},
			},
			{
				event: "response.function_call_arguments.done",
				data: {
					item_id: "call_weather_1",
					output_index: 0,
					name: "get_weather",
					arguments: "{\"city\":\"SF\"}",
				},
			},
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_fc_1",
						object: "response",
						created_at: 1710000002,
						model: "test-model",
						status: "completed",
						output: [
							{
								type: "function_call",
								call_id: "call_weather_1",
								name: "get_weather",
								arguments: "{\"city\":\"SF\"}",
							},
						],
						usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
					},
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			}),
			"responses",
		);

		const output = await readStreamText(stream);
		expect(output).toContain("\"tool_calls\"");
		expect(output).toContain("\"name\":\"get_weather\"");
		expect(output).toContain("\"arguments\":\"{\\\"city\\\":\\\"SF\\\"}\"");
	});

	it("emits output_item function-call events when transforming chat stream to responses", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_fc_1",
					object: "chat.completion.chunk",
					created: 1710000003,
					model: "test-model",
					choices: [{
						index: 0,
						delta: {
							tool_calls: [{
								index: 0,
								id: "call_weather_2",
								type: "function",
								function: {
									name: "get_weather",
									arguments: "{\"city\":\"",
								},
							}],
						},
					}],
				},
			},
			{
				data: {
					id: "chatcmpl_fc_1",
					object: "chat.completion.chunk",
					created: 1710000003,
					model: "test-model",
					choices: [{
						index: 0,
						delta: {
							tool_calls: [{
								index: 0,
								type: "function",
								function: {
									arguments: "SF\"}",
								},
							}],
						},
						finish_reason: "tool_calls",
					}],
					usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		expect(output).toContain("event: response.output_item.added");
		expect(output).toContain("event: response.function_call_arguments.delta");
		expect(output).toContain("event: response.function_call_arguments.done");
		expect(output).toContain("event: response.output_item.done");
	});
});
