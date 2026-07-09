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
