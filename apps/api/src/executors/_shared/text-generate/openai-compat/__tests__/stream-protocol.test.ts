import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";

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

async function readWithTimeout<T>(reader: ReadableStreamDefaultReader<T>, message: string) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			reader.read(),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error(message)), 100);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function parseSseJsonFrames(text: string): any[] {
	const out: any[] = [];
	for (const frame of text.split(/\n\n/)) {
		if (!frame.trim()) continue;
		let data = "";
		for (const line of frame.split(/\r?\n/)) {
			if (line.startsWith("data:")) {
				data += line.slice(5).trim();
			}
		}
		if (!data || data === "[DONE]") continue;
		try {
			out.push(JSON.parse(data));
		} catch {
			// Ignore non-JSON frames in tests.
		}
	}
	return out;
}

function baseArgs(overrides?: Record<string, any>): any {
	return {
		ir: {
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			model: "test-model",
			stream: true,
		},
		requestId: "req_stream_test",
		workspaceId: "team_test",
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

type ClientProtocol = "openai.chat.completions" | "openai.responses" | "anthropic.messages";

function deferredUpstream(route: "chat" | "responses") {
	const encoder = new TextEncoder();
	let release!: () => void;
	const completion = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sse = (event: string | null, data: any) => encoder.encode(
		`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
	);
	const response = new Response(new ReadableStream<Uint8Array>({
		start(controller) {
			if (route === "responses") {
				controller.enqueue(sse("response.created", {
					response: { id: "resp_matrix", model: "test-model" },
				}));
				controller.enqueue(sse("response.output_text.delta", {
					delta: "Hello",
					output_index: 0,
					item_id: "msg_matrix",
				}));
			} else {
				controller.enqueue(sse(null, {
					id: "chat_matrix",
					object: "chat.completion.chunk",
					model: "test-model",
					choices: [{ index: 0, delta: { content: "Hello" } }],
				}));
			}
			void completion.then(() => {
				if (route === "responses") {
					controller.enqueue(sse("response.completed", {
						response: {
							id: "resp_matrix",
							object: "response",
							status: "completed",
							model: "test-model",
							output: [{
								id: "msg_matrix",
								type: "message",
								role: "assistant",
								content: [{ type: "output_text", text: "Hello" }],
							}],
							usage: { input_tokens: 1, output_tokens: 1 },
						},
					}));
				} else {
					controller.enqueue(sse(null, {
						id: "chat_matrix",
						object: "chat.completion.chunk",
						model: "test-model",
						choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
					}));
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				}
				controller.close();
			});
		},
	}), { headers: { "Content-Type": "text/event-stream" } });
	return { response, release };
}

function deferredAnthropicUpstream() {
	const encoder = new TextEncoder();
	let release!: () => void;
	const completion = new Promise<void>((resolve) => {
		release = resolve;
	});
	const event = (payload: any) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(event({
				type: "message_start",
				message: { id: "msg_native", model: "test-model", usage: { input_tokens: 1, output_tokens: 0 } },
			}));
			controller.enqueue(event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
			controller.enqueue(event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }));
			void completion.then(() => {
				controller.enqueue(event({ type: "content_block_stop", index: 0 }));
				controller.enqueue(event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }));
				controller.enqueue(event({ type: "message_stop" }));
				controller.close();
			});
		},
	});
	return { stream, release };
}

async function expectTextBeforeCompletion(
	stream: ReadableStream<Uint8Array>,
	release: () => void,
	protocol: ClientProtocol,
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const marker = protocol === "openai.chat.completions"
		? '"content":"Hello"'
		: protocol === "openai.responses"
			? '"delta":"Hello"'
			: '"text":"Hello"';
	let beforeCompletion = "";
	while (!beforeCompletion.includes(marker)) {
		const next = await readWithTimeout(reader, `timed out for ${protocol}`);
		if (next.done) throw new Error(`stream ended before live ${protocol} text`);
		beforeCompletion += decoder.decode(next.value, { stream: true });
	}
	release();
	while (!(await reader.read()).done) {
		// Drain completion to prove the converter closes normally.
	}
}

describe("resolveStreamForProtocol", () => {
	it.each([
		["chat", "openai.chat.completions"],
		["chat", "openai.responses"],
		["chat", "anthropic.messages"],
		["responses", "openai.chat.completions"],
		["responses", "openai.responses"],
		["responses", "anthropic.messages"],
	] as const)("streams %s upstream incrementally to %s", async (route, protocol) => {
		const upstream = deferredUpstream(route);
		const stream = resolveStreamForProtocol(
			upstream.response,
			baseArgs({ protocol, endpoint: protocol === "anthropic.messages" ? "messages" : route }),
			route,
		);
		await expectTextBeforeCompletion(stream, upstream.release, protocol);
	});

	it.each([
		"openai.chat.completions",
		"openai.responses",
		"anthropic.messages",
	] as const)("streams native Anthropic incrementally to %s", async (protocol) => {
		const upstream = deferredAnthropicUpstream();
		const responsesStream = upstream.stream.pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_native_matrix", "test-model"),
		);
		const stream = resolveStreamForProtocol(
			new Response(responsesStream, { headers: { "Content-Type": "text/event-stream" } }),
			baseArgs({ providerId: "anthropic", protocol, endpoint: protocol === "anthropic.messages" ? "messages" : "responses" }),
			"responses",
		);
		await expectTextBeforeCompletion(stream, upstream.release, protocol);
	});

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

	it("preserves Perplexity citations and search billing in the completed Responses event", async () => {
		const upstream = makeSseResponse([{
			data: {
				id: "pplx_stream_1",
				object: "chat.completion.chunk",
				created: 1710000000,
				model: "sonar-deep-research",
				choices: [{ index: 0, delta: { content: "Grounded" }, finish_reason: "stop" }],
				citations: ["https://example.com/source"],
				search_results: [{ title: "Source", url: "https://example.com/source", source: "web" }],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 2,
					total_tokens: 5,
					citation_tokens: 7,
					num_search_queries: 2,
					search_context_size: "high",
					cost: { total_cost: 0.04 },
				},
			},
		}, "[DONE]"]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				providerId: "perplexity",
				providerModelSlug: "sonar-deep-research",
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const frames = parseSseJsonFrames(await readStreamText(stream));
		const completed = frames.find((frame) => frame?.response?.status === "completed")?.response;
		expect(completed.citations).toEqual(["https://example.com/source"]);
		expect(completed.search_results).toHaveLength(1);
		expect(completed.output[0].content[0].annotations[0]).toMatchObject({
			type: "url_citation",
			url: "https://example.com/source",
		});
		expect(completed.usage).toMatchObject({
			citation_tokens: 7,
			num_search_queries: 2,
			search_context_size: "high",
			cost: { total_cost: 0.04 },
		});
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

	it("emits anthropic text deltas before the responses stream completes", async () => {
		const encoder = new TextEncoder();
		let releaseCompletion!: () => void;
		const completion = new Promise<void>((resolve) => {
			releaseCompletion = resolve;
		});
		const frame = (event: string, data: any) =>
			encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
		const upstream = new Response(new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(frame("response.created", {
					response: { id: "resp_live", created_at: 1710000001, model: "test-model" },
				}));
				controller.enqueue(frame("response.output_text.delta", {
					delta: "Hello",
					output_index: 0,
					item_id: "msg_live",
				}));
				void completion.then(() => {
					controller.enqueue(frame("response.completed", {
						response: {
							id: "resp_live",
							object: "response",
							status: "completed",
							model: "test-model",
							output: [{
								id: "msg_live",
								type: "message",
								role: "assistant",
								content: [{ type: "output_text", text: "Hello" }],
							}],
							usage: { input_tokens: 1, output_tokens: 1 },
						},
					}));
					controller.close();
				});
			},
		}), { headers: { "Content-Type": "text/event-stream" } });

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({ endpoint: "messages", protocol: "anthropic.messages" }),
			"responses",
		);
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let beforeCompletion = "";
		while (!beforeCompletion.includes('"text":"Hello"')) {
			const next = await readWithTimeout(reader, "timed out waiting for live delta");
			if (next.done) throw new Error("stream ended before live delta");
			beforeCompletion += decoder.decode(next.value, { stream: true });
		}

		expect(beforeCompletion).toContain("event: message_start");
		expect(beforeCompletion).toContain("event: content_block_delta");
		expect(beforeCompletion).not.toContain("event: message_stop");

		releaseCompletion();
		let afterCompletion = "";
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			afterCompletion += decoder.decode(next.value, { stream: true });
		}
		expect(afterCompletion).toContain("event: message_stop");
	});

	it("keeps one ordered anthropic tool block across Responses item aliases", async () => {
		const upstream = makeSseResponse([
			{ event: "response.created", data: { response: { id: "resp_tool", model: "test-model" } } },
			{
				event: "response.reasoning_text.delta",
				data: { item_id: "reasoning_1", output_index: 0, delta: "Checking." },
			},
			{
				event: "response.output_item.added",
				data: {
					output_index: 1,
					item: { id: "item_1", call_id: "call_1", type: "function_call", name: "lookup" },
				},
			},
			{
				event: "response.function_call_arguments.delta",
				data: { item_id: "item_1", output_index: 1, delta: "{\"city\":\"SF\"}" },
			},
			{ event: "response.output_item.done", data: { output_index: 1, item: { id: "item_1", call_id: "call_1" } } },
			{
				event: "response.completed",
				data: { response: { id: "resp_tool", status: "completed", usage: { input_tokens: 2, output_tokens: 3 } } },
			},
		]);
		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({ endpoint: "messages", protocol: "anthropic.messages" }),
			"responses",
		);
		const frames = parseSseJsonFrames(await readStreamText(stream));
		const toolStarts = frames.filter((frame) => frame.type === "content_block_start" && frame.content_block?.type === "tool_use");
		expect(toolStarts).toHaveLength(1);
		expect(toolStarts[0].content_block).toMatchObject({ id: "call_1", name: "lookup" });
		expect(frames.filter((frame) => frame.delta?.type === "input_json_delta")).toHaveLength(1);
		const eventTypes = frames.map((frame) => frame.type);
		expect(eventTypes).toEqual([
			"message_start",
			"content_block_start",
			"content_block_delta",
			"content_block_stop",
			"content_block_start",
			"content_block_delta",
			"content_block_stop",
			"message_delta",
			"message_stop",
		]);
		expect(frames.find((frame) => frame.type === "message_delta")).toMatchObject({
			delta: { stop_reason: "tool_use" },
			usage: { input_tokens: 2, output_tokens: 3 },
		});
	});

	it("does not replay streamed text from the completed Responses output", async () => {
		const upstream = makeSseResponse([
			{ event: "response.created", data: { response: { id: "resp_text", model: "test-model" } } },
			{ event: "response.output_text.delta", data: { item_id: "message_1", output_index: 0, delta: "Hello" } },
			{ event: "response.output_text.done", data: { item_id: "message_1", output_index: 0 } },
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_text",
						status: "completed",
						output: [{ id: "message_1", type: "message", content: [{ type: "output_text", text: "Hello" }] }],
					},
				},
			},
		]);
		const frames = parseSseJsonFrames(await readStreamText(resolveStreamForProtocol(
			upstream,
			baseArgs({ endpoint: "messages", protocol: "anthropic.messages" }),
			"responses",
		)));
		expect(frames.filter((frame) => frame.delta?.type === "text_delta")).toHaveLength(1);
	});

	it("rejects truncated Responses streams instead of fabricating message_stop", async () => {
		const upstream = makeSseResponse([
			{ event: "response.created", data: { response: { id: "resp_partial", model: "test-model" } } },
			{ event: "response.output_text.delta", data: { item_id: "message_1", output_index: 0, delta: "Partial" } },
		]);
		await expect(readStreamText(resolveStreamForProtocol(
			upstream,
			baseArgs({ endpoint: "messages", protocol: "anthropic.messages" }),
			"responses",
		))).rejects.toMatchObject({ code: "sse_missing_terminal" });
	});

	it("converts chat-chunk stream to anthropic messages stream on responses route", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_msg_1",
					object: "chat.completion.chunk",
					created: 1710000006,
					model: "test-model",
					choices: [{ index: 0, delta: { content: "Hello " } }],
				},
			},
			{
				data: {
					id: "chatcmpl_msg_1",
					object: "chat.completion.chunk",
					created: 1710000006,
					model: "test-model",
					choices: [{ index: 0, delta: { content: "there" }, finish_reason: "stop" }],
					usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
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
		expect(output).toContain("event: content_block_delta");
		expect(output).toContain("\"text_delta\"");
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
				event: "response.reasoning_text.delta",
				data: {
					item_id: "rs_fc_1",
					output_index: 0,
					delta: "Need a lookup.",
				},
			},
			{
				event: "response.output_item.added",
				data: {
					output_index: 1,
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
					item_id: "fc_item_1",
					output_index: 1,
					delta: "{\"city\":\"SF\"}",
				},
			},
			{
				event: "response.function_call_arguments.done",
				data: {
					item_id: "fc_item_1",
					output_index: 1,
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
		const chunks = parseSseJsonFrames(output).filter((payload) => payload?.object === "chat.completion.chunk");
		const toolChunks = chunks.filter((payload) => Array.isArray(payload?.choices?.[0]?.delta?.tool_calls));
		expect(toolChunks.length).toBeGreaterThan(0);
		const deltas = toolChunks.map((chunk) => chunk.choices[0].delta.tool_calls[0]);
		expect(deltas.every((delta) => delta.index === 0)).toBe(true);
		expect(deltas.map((delta) => delta.id ?? "").join("")).toBe("call_weather_1");
		expect(deltas.map((delta) => delta.function?.name ?? "").join("")).toBe("get_weather");
		expect(deltas.map((delta) => delta.function?.arguments ?? "").join("")).toBe('{"city":"SF"}');
		expect(output).toContain("\"arguments\":\"{\\\"city\\\":\\\"SF\\\"}\"");
	});

	it("converts named responses tool_call stream events to chat tool_call deltas", async () => {
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: {
					response: {
						id: "resp_tc_1",
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
						type: "tool_call",
						id: "tc_item_1",
						call_id: "call_weather_1",
						function: {
							name: "get_weather",
							arguments: "",
						},
					},
				},
			},
			{
				event: "response.function_call_arguments.delta",
				data: {
					item_id: "tc_item_1",
					output_index: 0,
					delta: "{\"city\":\"SF\"}",
				},
			},
			{
				event: "response.function_call_arguments.done",
				data: {
					item_id: "tc_item_1",
					output_index: 0,
					name: "get_weather",
					arguments: "{\"city\":\"SF\"}",
				},
			},
			{
				event: "response.completed",
				data: { response: {
					id: "resp_tc_1", object: "response", model: "test-model", status: "completed",
					output: [{ type: "function_call", call_id: "call_weather_1", name: "get_weather", arguments: '{"city":"SF"}' }],
					usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
				} },
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				providerId: "poolside",
			}),
			"responses",
		);

		const output = await readStreamText(stream);
		const chunks = parseSseJsonFrames(output).filter((payload) => payload?.object === "chat.completion.chunk");
		const toolChunks = chunks.filter((payload) => Array.isArray(payload?.choices?.[0]?.delta?.tool_calls));
		expect(toolChunks.length).toBeGreaterThan(0);
		expect(toolChunks.every((chunk) => chunk.choices[0].index === 0)).toBe(true);
		const deltas = toolChunks.map((chunk) => chunk.choices[0].delta.tool_calls[0]);
		expect(deltas.every((delta) => delta.index === 0)).toBe(true);
		expect(deltas.map((delta) => delta.id ?? "").join("")).toBe("call_weather_1");
		expect(deltas.map((delta) => delta.function?.name ?? "").join("")).toBe("get_weather");
		expect(deltas.map((delta) => delta.function?.arguments ?? "").join("")).toBe('{"city":"SF"}');
		expect(output).toContain("\"arguments\":\"{\\\"city\\\":\\\"SF\\\"}\"");
	});

	it("does not convert generic responses tool_call completions to chat tool_call deltas", async () => {
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: {
					response: {
						id: "resp_fc_shadow",
						created_at: 1710000002,
						model: "test-model",
					},
				},
			},
			{
				event: "response.function_call_arguments.done",
				data: {
					item_id: "fc_shadow",
					output_index: 0,
					name: "tool_call",
					arguments: "{\"timezones\":[\"UTC\"]}",
				},
			},
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_fc_shadow",
						object: "response",
						created_at: 1710000002,
						model: "test-model",
						status: "completed",
						output: [],
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
		const chunks = parseSseJsonFrames(output).filter((payload) => payload?.object === "chat.completion.chunk");
		expect(chunks.some((payload) => Array.isArray(payload?.choices?.[0]?.delta?.tool_calls))).toBe(false);
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

	it("normalizes MiniMax XML interleaving into reasoning + function_call events", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_mm_1",
					object: "chat.completion.chunk",
					created: 1710000004,
					model: "minimax-m2",
					choices: [{
						index: 0,
						delta: {
							content: "<think>plan the tool call</think>",
						},
					}],
				},
			},
			{
				data: {
					id: "chatcmpl_mm_1",
					object: "chat.completion.chunk",
					created: 1710000004,
					model: "minimax-m2",
					choices: [{
						index: 0,
						delta: {
							content: "<invoke name=\"get_weather\"><parameter name=\"city\">London</parameter></invoke>",
						},
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				providerId: "minimax",
				endpoint: "responses",
				protocol: "openai.responses",
				ir: {
					messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
					model: "minimax/minimax-m2",
					stream: true,
					tools: [{ name: "get_weather", description: "Get weather", parameters: { type: "object" } }],
					toolChoice: { name: "get_weather" },
				},
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		expect(output).toContain("event: response.reasoning_text.delta");
		expect(output).toContain("event: response.output_item.added");
		expect(output).toContain("event: response.function_call_arguments.done");
		expect(output).toContain("\"name\":\"get_weather\"");
		expect(output).not.toContain("<invoke");
	});

	it("preserves image output when converting chat stream to responses stream", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_img_1",
					object: "chat.completion.chunk",
					created: 1710000005,
					model: "gemini-2.5-flash-image",
					choices: [{ index: 0, delta: { content: "Done." } }],
				},
			},
			{
				data: {
					id: "chatcmpl_img_1",
					object: "chat.completion",
					created: 1710000005,
					model: "gemini-2.5-flash-image",
					choices: [{
						index: 0,
						message: {
							role: "assistant",
							content: "Done.",
							images: [{
								type: "image_url",
								image_url: { url: "data:image/png;base64,ZmFrZS1pbWFnZQ==" },
							}],
						},
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				providerId: "google-ai-studio",
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		const frames = parseSseJsonFrames(output);
		const completed = frames.find((payload) => payload?.response?.object === "response");
		const outputItems = completed?.response?.output ?? [];
		const messageItem = outputItems.find((item: any) => item?.type === "message");
		const imageBlock = Array.isArray(messageItem?.content)
			? messageItem.content.find((part: any) => part?.type === "output_image")
			: null;

		expect(imageBlock).toBeDefined();
		expect(typeof imageBlock?.image_url?.url === "string" || typeof imageBlock?.b64_json === "string").toBe(true);
	});

	it("preserves delta-only image output when chat stream never emits a final snapshot", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_img_delta_1",
					object: "chat.completion.chunk",
					created: 1710000008,
					model: "gemini-2.5-flash-image",
					choices: [{
						index: 0,
						delta: {
							content: "Done.",
							images: [{
								type: "image_url",
								image_url: { url: "data:image/png;base64,ZmFrZS1pbWFnZQ==" },
							}],
						},
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				providerId: "google-ai-studio",
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		const frames = parseSseJsonFrames(output);
		const completed = frames.find((payload) => payload?.response?.object === "response");
		const outputItems = completed?.response?.output ?? [];
		const messageItem = outputItems.find((item: any) => item?.type === "message");
		const imageBlock = Array.isArray(messageItem?.content)
			? messageItem.content.find((part: any) => part?.type === "output_image")
			: null;

		expect(imageBlock).toBeDefined();
		expect(typeof imageBlock?.image_url?.url === "string" || typeof imageBlock?.b64_json === "string").toBe(true);
	});

	it("preserves audio output when converting chat stream to responses stream", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					id: "chatcmpl_audio_1",
					object: "chat.completion.chunk",
					created: 1710000007,
					model: "lyria-3-pro",
					choices: [{ index: 0, delta: { content: "Done." } }],
				},
			},
			{
				data: {
					id: "chatcmpl_audio_1",
					object: "chat.completion",
					created: 1710000007,
					model: "lyria-3-pro",
					choices: [{
						index: 0,
						message: {
							role: "assistant",
							content: "Done.",
							audios: [{
								type: "audio_url",
								audio_url: { url: "data:audio/wav;base64,UklGRlIAAABXQVZFZm10" },
								format: "wav",
							}],
						},
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
				},
			},
			"[DONE]",
		]);

		const stream = resolveStreamForProtocol(
			upstream,
			baseArgs({
				providerId: "google-ai-studio",
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			"chat",
		);

		const output = await readStreamText(stream);
		const frames = parseSseJsonFrames(output);
		const completed = frames.find((payload) => payload?.response?.object === "response");
		const outputItems = completed?.response?.output ?? [];
		const messageItem = outputItems.find((item: any) => item?.type === "message");
		const audioBlock = Array.isArray(messageItem?.content)
			? messageItem.content.find((part: any) => part?.type === "output_audio")
			: null;

		expect(audioBlock).toBeDefined();
		expect(typeof audioBlock?.audio_url?.url === "string" || typeof audioBlock?.b64_json === "string").toBe(true);
	});
});
