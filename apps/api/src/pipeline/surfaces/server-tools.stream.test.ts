import { describe, expect, it } from "vitest";
import { buildSyntheticServerToolStream, consumeTextProtocolStreamToIR } from "./server-tools.stream";

function buildSseStream(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) {
				controller.enqueue(encoder.encode(frame));
			}
			controller.close();
		},
	});
}

describe("consumeTextProtocolStreamToIR", () => {
	it.each([
		["max_tokens", { finishReason: "length" }],
		["stop_sequence", { finishReason: "stop", finishDetail: "stop_sequence", stopSequence: "###" }],
		["pause_turn", { finishReason: "stop", finishDetail: "pause_turn" }],
		["refusal", { finishReason: "content_filter", finishDetail: "refusal" }],
		["end_turn", { finishReason: "stop" }],
	])("keeps the Messages stop reason %s when message_stop follows", async (stopReason, expected) => {
		const frame = (event: string, data: any) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;
		const stream = buildSseStream([
			frame("message_start", { message: { id: "msg_1", role: "assistant", content: [], usage: { input_tokens: 5, output_tokens: 1 } } }),
			frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
			frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hi" } }),
			frame("content_block_stop", { index: 0 }),
			frame("message_delta", { delta: { stop_reason: stopReason, stop_sequence: stopReason === "stop_sequence" ? "###" : null }, usage: { output_tokens: 3 } }),
			frame("message_stop", {}),
		]);
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "anthropic.messages",
			stream,
			requestId: "req_messages_stop",
			model: "claude",
			provider: "anthropic",
		});
		const choice = consumed.ir.choices[0];
		expect({ finishReason: choice.finishReason, finishDetail: choice.finishDetail, stopSequence: choice.stopSequence })
			.toEqual({ finishDetail: undefined, stopSequence: undefined, ...expected });
	});

	it.each([
		["stop", "length"],
		["length", "stop"],
	])("preserves different choice finish reasons (%s, %s) before a usage-only frame", async (...finishReasons) => {
		const stream = buildSseStream([
			...finishReasons.map((finishReason, index) => `data: ${JSON.stringify({
				object: "chat.completion.chunk",
				choices: [{ index, delta: { reasoning_content: `Reasoning ${index}.` }, finish_reason: finishReason }],
			})}\n\n`),
			`data: ${JSON.stringify({
				object: "chat.completion.chunk",
				choices: [],
				usage: { prompt_tokens: 10, completion_tokens: 6500, total_tokens: 6510 },
			})}\n\n`,
			"data: [DONE]\n\n",
		]);
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_multiple_choices",
			model: "test-model",
			provider: "test-provider",
		});
		expect(consumed.ir.choices.map((choice) => choice.finishReason)).toEqual(finishReasons);
		expect(consumed.ir.usage?.outputTokens).toBe(6500);
	});

	it("materializes fragmented Anthropic tool arguments by content block index", async () => {
		const stream = buildSseStream([
			`event: message_start\ndata: ${JSON.stringify({
				type: "message_start",
				message: { id: "msg_tool", model: "test-model", usage: { input_tokens: 4, output_tokens: 0 } },
			})}\n\n`,
			`event: content_block_start\ndata: ${JSON.stringify({
				type: "content_block_start",
				index: 2,
				content_block: { type: "tool_use", id: "call_weather", name: "get_weather", input: {} },
			})}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({
				type: "content_block_delta",
				index: 2,
				delta: { type: "input_json_delta", partial_json: "{\"city\":" },
			})}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({
				type: "content_block_delta",
				index: 2,
				delta: { type: "input_json_delta", partial_json: "\"London\"}" },
			})}\n\n`,
			`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 2 })}\n\n`,
			`event: content_block_start\ndata: ${JSON.stringify({
				type: "content_block_start",
				index: 5,
				content_block: { type: "tool_use", id: "call_time", name: "get_time", input: {} },
			})}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({
				type: "content_block_delta",
				index: 5,
				delta: { type: "input_json_delta", partial_json: "{\"timezone\":" },
			})}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({
				type: "content_block_delta",
				index: 5,
				delta: { type: "input_json_delta", partial_json: "\"UTC\"}" },
			})}\n\n`,
			`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 5 })}\n\n`,
			`event: message_delta\ndata: ${JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "tool_use", stop_sequence: null },
				usage: { output_tokens: 8 },
			})}\n\n`,
			`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "anthropic.messages",
			stream,
			requestId: "req_anthropic_tool",
			model: "openai/gpt-5.6-luna",
			provider: "openai",
		});

		expect(consumed.ir.choices[0]?.message?.toolCalls).toEqual([
			{
				id: "call_weather",
				name: "get_weather",
				arguments: "{\"city\":\"London\"}",
			},
			{
				id: "call_time",
				name: "get_time",
				arguments: "{\"timezone\":\"UTC\"}",
			},
		]);
	});

	it("preserves populated Anthropic tool input from the block start", async () => {
		const stream = buildSseStream([
			`event: content_block_start\ndata: ${JSON.stringify({
				type: "content_block_start",
				index: 0,
				content_block: { type: "tool_use", id: "call_calc", name: "calc", input: { a: 1 } },
			})}\n\n`,
			`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
			`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "anthropic.messages",
			stream,
			requestId: "req_anthropic_populated_tool",
			model: "anthropic/claude-sonnet-4.5",
			provider: "anthropic",
		});

		expect(consumed.ir.choices[0]?.message?.toolCalls).toEqual([{
			id: "call_calc",
			name: "calc",
			arguments: "{\"a\":1}",
		}]);
	});

	it("deduplicates Responses function-call item and argument events for one provider call", async () => {
		const stream = buildSseStream([
			`event: response.output_item.added\ndata: ${JSON.stringify({
				output_index: 0,
				item: {
					type: "function_call",
					id: "fc_datetime",
					call_id: "call_datetime",
					name: "gateway_datetime",
					arguments: "",
				},
			})}\n\n`,
			`event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
				item_id: "fc_datetime",
				call_id: "call_datetime",
				output_index: 0,
				delta: "{\"timezones\"",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "fc_datetime",
				call_id: "call_datetime",
				output_index: 0,
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			})}\n\n`,
			`event: response.output_item.done\ndata: ${JSON.stringify({
				output_index: 0,
				item: {
					type: "function_call",
					id: "fc_datetime",
					call_id: "call_datetime",
					name: "gateway_datetime",
					arguments: "{\"timezones\":[\"UTC\"]}",
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_responses_tool",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		const toolCalls = consumed.ir.choices[0]?.message?.toolCalls ?? [];
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]).toEqual({
			id: "call_datetime",
			name: "gateway_datetime",
			arguments: "{\"timezones\":[\"UTC\"]}",
		});
	});

	it("recovers final assistant text from terminal chat completion snapshots", async () => {
		const finalPayload = {
			id: "req_server_tool_stream",
			object: "chat.completion",
			created: 1778073808,
			model: "gpt-5.4-nano-2026-03-17",
			provider: "openai",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Current time is 12:00 UTC.",
					},
					finish_reason: "stop",
				},
			],
			usage: {
				input_tokens: 10,
				output_tokens: 6,
				total_tokens: 16,
				server_tool_use: {
					datetime_requests: 1,
					image_generation_requests: 1,
					apply_patch_requests: 1,
				},
			},
		};

		const stream = buildSseStream([
			`data: ${JSON.stringify(finalPayload)}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_server_tool_stream",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.sawDone).toBe(true);
		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Current time is 12:00 UTC." },
		]);
		expect(consumed.ir.usage?._ext?.serverToolUse?.datetime_requests).toBe(1);
		expect(consumed.ir.usage?._ext?.serverToolUse?.image_generation_requests).toBe(1);
		expect(consumed.ir.usage?._ext?.serverToolUse?.apply_patch_requests).toBe(1);
	});

	it("backfills real tool call ids when earlier chat deltas omit them", async () => {
		const stream = buildSseStream([
			`data: ${JSON.stringify({
				id: "chatcmpl_tool_delta",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano-2026-03-17",
				choices: [{
					index: 0,
					delta: {
						role: "assistant",
						tool_calls: [{
							index: 0,
							type: "function",
							function: {
								name: "get_weather",
								arguments: "{\"city\":\"London\"}",
							},
						}],
					},
					finish_reason: null,
				}],
			})}\n\n`,
			`data: ${JSON.stringify({
				id: "chatcmpl_tool_delta",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano-2026-03-17",
				choices: [{
					index: 0,
					delta: {
						tool_calls: [{
							index: 0,
							id: "call_weather",
						}],
					},
					finish_reason: "tool_calls",
				}],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 6,
					total_tokens: 16,
				},
			})}`,
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_server_tool_stream",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.ir.choices[0]?.message?.toolCalls).toEqual([
			{
				id: "call_weather",
				name: "get_weather",
				arguments: "{\"city\":\"London\"}",
			},
		]);
		expect(consumed.ir.choices[0]?.finishReason).toBe("tool_calls");
	});

	it("preserves image output when materializing a responses snapshot", async () => {
		const finalPayload = {
			id: "resp_gemini_image",
			object: "response",
			created_at: 1778073808,
			model: "google/gemini-2.5-flash-image",
			status: "completed",
			output: [
				{
					type: "message",
					id: "msg_gemini_image",
					status: "completed",
					role: "assistant",
					content: [
						{ type: "output_text", text: "Here's your image.", annotations: [] },
						{
							type: "output_image",
							b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
							mime_type: "image/png",
						},
					],
				},
			],
			usage: {
				input_tokens: 12,
				output_tokens: 18,
				total_tokens: 30,
			},
		};

		const stream = buildSseStream([
			`event: response.completed\ndata: ${JSON.stringify({ response: finalPayload })}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_gemini_image",
			model: "google/gemini-2.5-flash-image",
			provider: "google-ai-studio",
		});

		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Here's your image." },
			{
				type: "image",
				source: "data",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				mimeType: "image/png",
			},
		]);
		expect(consumed.rawResponse?.output?.[0]?.content?.[1]?.type).toBe("output_image");
	});

	it("ignores generic responses tool_call items when materializing tool calls", async () => {
		const stream = buildSseStream([
			`event: response.output_item.added\ndata: ${JSON.stringify({
				output_index: 0,
				item: {
					type: "function_call",
					id: "fc_datetime",
					call_id: "call_datetime",
					name: "gateway_datetime",
					arguments: "{\"timezones\":[\"UTC\"]}",
				},
			})}\n\n`,
			`event: response.output_item.added\ndata: ${JSON.stringify({
				output_index: 1,
				item: {
					type: "tool_call",
					id: "tc_unknown",
					status: "completed",
				},
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					status: "completed",
					output: [
						{
							type: "function_call",
							id: "fc_datetime",
							call_id: "call_datetime",
							name: "gateway_datetime",
							arguments: "{\"timezones\":[\"UTC\"]}",
						},
						{
							type: "tool_call",
							id: "tc_unknown",
							status: "completed",
						},
					],
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_datetime",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.ir.choices.flatMap((choice) => choice.message.toolCalls ?? [])).toEqual([
			{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			},
		]);
	});

	it("materializes named responses tool_call items as tool calls", async () => {
		const stream = buildSseStream([
			`event: response.output_item.added\ndata: ${JSON.stringify({
				output_index: 0,
				item: {
					type: "tool_call",
					id: "tc_datetime",
					call_id: "call_datetime",
					function: {
						name: "gateway_datetime",
						arguments: "{\"timezones\":[\"UTC\"]}",
					},
				},
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					status: "completed",
					output: [
						{
							type: "tool_call",
							id: "tc_datetime",
							call_id: "call_datetime",
							function: {
								name: "gateway_datetime",
								arguments: "{\"timezones\":[\"UTC\"]}",
							},
						},
					],
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_datetime",
			model: "poolside/laguna-xs-2.1:free",
			provider: "poolside",
		});

		expect(consumed.ir.choices[0]?.finishReason).toBe("tool_calls");
		expect(consumed.ir.choices.flatMap((choice) => choice.message.toolCalls ?? [])).toEqual([
			{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			},
		]);
	});

	it("ignores generic responses tool_call argument completions when materializing tool calls", async () => {
		const stream = buildSseStream([
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "call_datetime",
				output_index: 1,
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "fc_shadow",
				output_index: 2,
				name: "tool_call",
				arguments: "{\"timezones\":[\"UTC\"]}",
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_datetime",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.ir.choices.flatMap((choice) => choice.message.toolCalls ?? [])).toEqual([
			{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			},
		]);
	});

	it("keeps responses argument-completion tool calls when the final snapshot has no output", async () => {
		const stream = buildSseStream([
			`event: response.created\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					model: "gpt-5.4-nano",
					status: "in_progress",
				},
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "call_datetime",
				output_index: 0,
				name: "gateway_datetime",
				arguments: "{\"timezones\":[]}",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "fc_shadow",
				output_index: 1,
				name: "tool_call",
				arguments: "{\"timezones\":[]}",
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					model: "gpt-5.4-nano",
					status: "completed",
					usage: {
						input_tokens: 101,
						output_tokens: 18,
						total_tokens: 119,
					},
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_datetime",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.ir.choices[0]?.finishReason).toBe("tool_calls");
		expect(consumed.ir.choices.flatMap((choice) => choice.message.toolCalls ?? [])).toEqual([
			{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[]}",
			},
		]);
	});

	it("keeps reasoning and later Responses tool calls on the same choice", async () => {
		const stream = buildSseStream([
			`event: response.created\ndata: ${JSON.stringify({
				response: {
					id: "resp_laguna_datetime",
					object: "response",
					model: "laguna-xs-2.1",
					status: "in_progress",
				},
			})}\n\n`,
			`event: response.reasoning_text.delta\ndata: ${JSON.stringify({
				item_id: "rs_laguna_datetime",
				output_index: 0,
				delta: "Need the current time.",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "chatcmpl-tool-laguna",
				output_index: 1,
				name: "gateway_datetime",
				arguments: "{}",
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_laguna_datetime",
					object: "response",
					model: "laguna-xs-2.1",
					status: "completed",
					usage: {
						input_tokens: 101,
						output_tokens: 18,
						total_tokens: 119,
					},
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_laguna_datetime",
			model: "poolside/laguna-xs-2.1:free",
			provider: "poolside",
		});

		expect(consumed.ir.choices).toHaveLength(1);
		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "reasoning_text", text: "Need the current time." },
		]);
		expect(consumed.ir.choices[0]?.message?.toolCalls).toEqual([
			{
				id: "chatcmpl-tool-laguna",
				name: "gateway_datetime",
				arguments: "{}",
			},
		]);
		expect(consumed.ir.choices[0]?.finishReason).toBe("tool_calls");
	});

	it("preserves media from chat completion deltas", async () => {
		const stream = buildSseStream([
			`data: ${JSON.stringify({
				id: "chatcmpl_gemini_image",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "google/gemini-2.5-flash-image",
				choices: [{
					index: 0,
					delta: {
						role: "assistant",
						content: "Here's your image.",
						images: [{
							type: "image_url",
							image_url: {
								url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
							},
							mime_type: "image/png",
						}],
					},
					finish_reason: "stop",
				}],
				usage: {
					prompt_tokens: 9,
					completion_tokens: 7,
					total_tokens: 16,
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_chat_gemini_image",
			model: "google/gemini-2.5-flash-image",
			provider: "google-ai-studio",
		});

		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Here's your image." },
			{
				type: "image",
				source: "data",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				mimeType: "image/png",
			},
		]);
	});

	it("preserves response content ordering when media precedes text", async () => {
		const syntheticStream = buildSyntheticServerToolStream({
			protocol: "openai.responses",
			requestId: "resp_gemini_image_order",
			model: "google/gemini-2.5-flash-image",
			payload: {
				id: "resp_gemini_image_order",
				object: "response",
				created_at: 1778073808,
				model: "google/gemini-2.5-flash-image",
				status: "completed",
				output: [
					{
						type: "message",
						id: "msg_gemini_image_order",
						status: "completed",
						role: "assistant",
						content: [
							{
								type: "output_image",
								b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
								mime_type: "image/png",
							},
							{ type: "output_text", text: "Then some text.", annotations: [] },
						],
					},
				],
				usage: {
					input_tokens: 12,
					output_tokens: 18,
					total_tokens: 30,
				},
			},
		});

		expect(syntheticStream).not.toBeNull();

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream: syntheticStream as ReadableStream<Uint8Array>,
			requestId: "resp_gemini_image_order",
			model: "google/gemini-2.5-flash-image",
			provider: "google-ai-studio",
		});

		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{
				type: "image",
				source: "data",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				mimeType: "image/png",
			},
			{ type: "text", text: "Then some text." },
		]);
	});

	it("emits sanitized server tool traces in synthetic Responses streams", async () => {
		const syntheticStream = buildSyntheticServerToolStream({
			protocol: "openai.responses",
			requestId: "resp_datetime_trace",
			model: "openai/gpt-5.4-nano",
			serverToolTrace: [{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
				output: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-07-06T12:00:00.000+00:00\"}]}",
			}],
			payload: {
				id: "resp_datetime_trace",
				object: "response",
				model: "openai/gpt-5.4-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{
						type: "output_text",
						text: "It is noon UTC.",
					}],
				}],
			},
		});

		expect(syntheticStream).not.toBeNull();
		const text = await new Response(syntheticStream).text();

		expect(text).toContain("event: response.output_item.done");
		expect(text).toContain("\"name\":\"gateway_datetime\"");
		expect(text).toContain("\"output\":");
		expect(text).toContain("It is noon UTC.");
		expect(text).not.toContain("\"name\":\"tool_call\"");
	});
});

describe("buildSyntheticServerToolStream Responses frames", () => {
	async function readFrames(stream: ReadableStream<Uint8Array> | null) {
		expect(stream).not.toBeNull();
		const text = await new Response(stream).text();
		return text.split("\n\n").filter(Boolean).map((block) => {
			const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
			const data = block.split("\n").find((line) => line.startsWith("data: "))!.slice(6);
			return { event, data: data === "[DONE]" ? data : JSON.parse(data) };
		});
	}

	it("streams a final client function call as a whole item after the server tool it follows", async () => {
		const payload = {
			id: "req_mixed",
			object: "response",
			model: "openai/gpt-5.4-nano",
			status: "completed",
			output: [{ type: "function_call", call_id: "call_weather", name: "get_weather", arguments: "{\"city\":\"London\"}" }],
			usage: { input_tokens: 40, output_tokens: 12, total_tokens: 52 },
		};
		const frames = await readFrames(buildSyntheticServerToolStream({
			protocol: "openai.responses",
			requestId: "req_mixed",
			model: "openai/gpt-5.4-nano",
			serverToolTrace: [{ id: "call_dt", name: "gateway_datetime", arguments: "{\"timezones\":[\"UTC\"]}", output: "{\"datetime\":\"12:00\"}" }],
			payload,
		}));

		expect(frames.map((frame) => frame.event)).toEqual([
			"response.created",
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
			"response.completed",
			null,
		]);
		// Every data object names its event, as clients that dispatch on data.type need.
		for (const frame of frames.slice(0, -1)) expect(frame.data.type).toBe(frame.event);
		expect(frames.at(-1)!.data).toBe("[DONE]");

		const [, serverAdded, , , serverDone, clientAdded, clientDelta, clientArgumentsDone, clientDone, completed] = frames.map((frame) => frame.data);
		expect(serverAdded).toMatchObject({ output_index: 0, item: { type: "function_call", call_id: "call_dt", name: "gateway_datetime", status: "in_progress" } });
		expect(serverDone).toMatchObject({ output_index: 0, item: { call_id: "call_dt", output: "{\"datetime\":\"12:00\"}", status: "completed" } });
		expect(clientAdded).toMatchObject({ output_index: 1, item: { type: "function_call", call_id: "call_weather", name: "get_weather", arguments: "" } });
		const itemId = clientAdded.item.id;
		expect(clientDelta).toMatchObject({ item_id: itemId, output_index: 1, delta: "{\"city\":\"London\"}" });
		expect(clientArgumentsDone).toMatchObject({ item_id: itemId, output_index: 1, name: "get_weather", arguments: "{\"city\":\"London\"}" });
		expect(clientDone).toMatchObject({ output_index: 1, item: { id: itemId, type: "function_call", call_id: "call_weather", arguments: "{\"city\":\"London\"}", status: "completed" } });
		expect(clientDone.item.output).toBeUndefined();
		// The terminal event carries the whole body, its output listing the streamed item.
		expect(completed.response).toMatchObject({ id: "req_mixed", status: "completed", usage: payload.usage });
		expect(completed.response.output).toEqual([{ ...payload.output[0], id: itemId, status: "completed" }]);
	});

	it("streams reasoning as reasoning events and only the answer as output text", async () => {
		const frames = await readFrames(buildSyntheticServerToolStream({
			protocol: "openai.responses",
			requestId: "req_reasoning",
			payload: {
				id: "req_reasoning",
				object: "response",
				status: "completed",
				output: [
					{ type: "reasoning", id: "rs_req_reasoning_0_0", summary: [], content: [{ type: "reasoning_text", text: "Check the clock." }] },
					{ type: "message", role: "assistant", content: [{ type: "output_text", text: "It is noon.", annotations: [] }] },
				],
				usage: { input_tokens: 10, output_tokens: 6, total_tokens: 16 },
			},
		}));

		expect(frames.map((frame) => frame.event)).toEqual([
			"response.created",
			"response.output_item.added",
			"response.content_part.added",
			"response.reasoning_text.delta",
			"response.reasoning_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
			null,
		]);
		for (const frame of frames.slice(0, -1)) expect(frame.data.type).toBe(frame.event);
		const data = frames.map((frame) => frame.data);
		expect(data[1].item).toEqual({ id: "rs_req_reasoning_0_0", type: "reasoning", summary: [], content: [] });
		expect(data[3]).toMatchObject({ item_id: "rs_req_reasoning_0_0", delta: "Check the clock." });
		expect(data[7].item).toMatchObject({ type: "message", role: "assistant", status: "in_progress", content: [] });
		expect(data[9]).toMatchObject({ item_id: data[7].item.id, output_index: 1, content_index: 0, delta: "It is noon." });
		const outputText = data.filter((frame: any) => String(frame?.type).startsWith("response.output_text.")).map((frame: any) => frame.delta ?? frame.text);
		expect(outputText).toEqual(["It is noon.", "It is noon."]);
		expect(data[13].response.output.map((item: any) => item.type)).toEqual(["reasoning", "message"]);
	});

	it("ends an incomplete body with response.incomplete", async () => {
		const frames = await readFrames(buildSyntheticServerToolStream({
			protocol: "openai.responses",
			requestId: "req_incomplete",
			payload: {
				id: "req_incomplete",
				object: "response",
				status: "incomplete",
				incomplete_details: { reason: "max_output_tokens" },
				output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Partial", annotations: [] }] }],
			},
		}));
		const terminal = frames.at(-2)!;
		expect(terminal.event).toBe("response.incomplete");
		expect(terminal.data.response).toMatchObject({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
	});
});
