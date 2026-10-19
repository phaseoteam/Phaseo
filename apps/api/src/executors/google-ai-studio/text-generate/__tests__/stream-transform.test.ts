import { describe, expect, it } from "vitest";
import { transformStream } from "../index";

function makeGoogleSseStream(payloads: any[]): ReadableStream<Uint8Array> {
	const body = payloads
		.map((payload) => `data: ${JSON.stringify(payload)}\n\n`)
		.join("");
	return new Response(body, {
		headers: { "Content-Type": "text/event-stream" },
	}).body as ReadableStream<Uint8Array>;
}

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return await new Response(stream).text();
}

function parseSseEvents(output: string): Array<{ event: string; data: any }> {
	return output.split(/\n\n/).flatMap((frame) => {
		const event = frame.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
		const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
		if (!event || !data || data === "[DONE]") return [];
		return [{ event, data: JSON.parse(data) }];
	});
}

function baseArgs(overrides?: Record<string, any>): any {
	return {
		ir: {
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			model: "gemini-2.5-flash",
			stream: true,
		},
		requestId: "req_google_stream_test",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
		...overrides,
	};
}

describe("google-ai-studio stream transform", () => {
	it.each([
		["MAX_TOKENS", "length"],
		["STOP", "stop"],
	])("preserves reasoning-only streams ending with %s", async (providerFinishReason, finishReason) => {
		const upstream = makeGoogleSseStream([{
			candidates: [{
				index: 0,
				content: { role: "model", parts: [{ text: "Partial reasoning.", thought: true }] },
				finishReason: providerFinishReason,
			}],
			usageMetadata: { promptTokenCount: 5, thoughtsTokenCount: 10, totalTokenCount: 15 },
		}]);
		const output = await readStreamText(transformStream(upstream, baseArgs()));
		const chunks = output.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
		const choices = chunks.flatMap((chunk) => chunk.choices);
		expect(choices.some((choice) => choice.delta?.reasoning_content === "Partial reasoning.")).toBe(true);
		expect(choices.some((choice) => choice.finish_reason === finishReason)).toBe(true);
		expect(choices.some((choice) => Boolean(choice.delta?.content))).toBe(false);
		expect(output).not.toContain("response.failed");
		expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
	});

	it.each([
		"SAFETY",
		"PROHIBITED_CONTENT",
		"RECITATION",
		"SPII",
		"BLOCKLIST",
		"LANGUAGE",
		"MODEL_ARMOR",
		"ESCALATION",
		"IMAGE_SAFETY",
		"IMAGE_PROHIBITED_CONTENT",
		"IMAGE_RECITATION",
	])("ends a stream blocked with %s as content_filter, not as an error", async (providerFinishReason) => {
		const upstream = makeGoogleSseStream([{
			candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: providerFinishReason }],
			usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0, totalTokenCount: 5 },
		}]);
		const output = await readStreamText(transformStream(upstream, baseArgs()));
		const chunks = output.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
		expect(chunks.flatMap((chunk) => chunk.choices).some((choice) => choice.finish_reason === "content_filter")).toBe(true);
		expect(output).not.toContain("response.failed");
		expect(output).not.toContain("google_empty_response");
	});

	it("ends a stream whose prompt was blocked as content_filter", async () => {
		const upstream = makeGoogleSseStream([{
			promptFeedback: { blockReason: "SAFETY" },
			usageMetadata: { promptTokenCount: 5, totalTokenCount: 5 },
		}]);
		const output = await readStreamText(transformStream(upstream, baseArgs()));
		const chunks = output.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
		expect(chunks.flatMap((chunk) => chunk.choices).some((choice) => choice.finish_reason === "content_filter")).toBe(true);
		expect(output).not.toContain("google_empty_response");
	});

	it("emits a structured error instead of a blank successful stream", async () => {
		const upstream = makeGoogleSseStream([
			{
				interaction: {
					id: "v1_empty",
					status: "completed",
					usage: { total_input_tokens: 5, total_output_tokens: 0, total_tokens: 5 },
				},
				event_type: "interaction.completed",
			},
		]);

		const output = await readStreamText(transformStream(upstream, baseArgs()));

		expect(output).toContain("event: response.failed");
		expect(output).toContain("google_empty_response");
		expect(output).toContain("data: [DONE]");
	});

	it("emits chat tool_call deltas from Interactions function_call steps", async () => {
		const upstream = makeGoogleSseStream([
			{
				index: 0,
				step: {
					type: "function_call",
					id: "call_weather",
					name: "get_weather",
					arguments: {},
				},
				event_type: "step.start",
			},
			{
				index: 0,
				delta: {
					type: "arguments_delta",
					arguments: "{\"city\":\"SF\"}",
				},
				event_type: "step.delta",
			},
			{
				interaction: {
					id: "v1_test",
					status: "requires_action",
					usage: {
						total_input_tokens: 5,
						total_output_tokens: 3,
						total_tokens: 8,
					},
				},
				event_type: "interaction.completed",
			},
		]);

		const stream = transformStream(upstream, baseArgs());
		const output = await readStreamText(stream);

		expect(output).toContain("\"tool_calls\"");
		expect(output).toContain("\"name\":\"get_weather\"");
		expect(output).toContain("\"arguments\":\"{\\\"city\\\":\\\"SF\\\"}\"");
		expect(output).toContain("\"finish_reason\":\"tool_calls\"");
	});

	it("converts Gemini functionCall stream to responses function call events", async () => {
		const upstream = makeGoogleSseStream([
			{
				index: 0,
				step: {
					type: "function_call",
					id: "call_weather",
					name: "get_weather",
					arguments: {},
				},
				event_type: "step.start",
			},
			{
				index: 0,
				delta: {
					type: "arguments_delta",
					arguments: "{\"city\":\"",
				},
				event_type: "step.delta",
			},
			{
				index: 0,
				delta: {
					type: "arguments_delta",
					arguments: "SF\"}",
				},
				event_type: "step.delta",
			},
			{
				interaction: {
					id: "v1_test",
					status: "requires_action",
					usage: {
						total_input_tokens: 5,
						total_output_tokens: 3,
						total_tokens: 8,
					},
				},
				event_type: "interaction.completed",
			},
		]);

		const stream = transformStream(upstream, baseArgs({
			endpoint: "responses",
			protocol: "openai.responses",
		}));
		const output = await readStreamText(stream);

		expect(output).toContain("event: response.output_item.added");
		expect(output).toContain("event: response.function_call_arguments.delta");
		expect(output).toContain("event: response.function_call_arguments.done");
		expect(output).toContain("event: response.output_item.done");
		expect(output).toContain("\"arguments\":\"{\\\"city\\\":\\\"SF\\\"}\"");
	});

	it("converts legacy Gemini candidate functionCall parts to responses events", async () => {
		const upstream = makeGoogleSseStream([
			{
				candidates: [{
					index: 0,
					content: {
						role: "model",
						parts: [{
							functionCall: {
								name: "gateway_datetime",
								args: { timezone: "Europe/London" },
							},
						}],
					},
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 20,
					candidatesTokenCount: 5,
					totalTokenCount: 25,
				},
			},
		]);

		const output = await readStreamText(transformStream(upstream, baseArgs({
			endpoint: "responses",
			protocol: "openai.responses",
		})));

		const events = parseSseEvents(output);
		const eventNames = events.map((event) => event.event);
		const expectedOrder = [
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
		];
		expect(eventNames.filter((event) => expectedOrder.includes(event))).toEqual(expectedOrder);

		const added = events.find((event) => event.event === "response.output_item.added")?.data;
		const done = events.find((event) => event.event === "response.output_item.done")?.data;
		expect(added?.item).toMatchObject({
			type: "function_call",
			name: "gateway_datetime",
		});
		expect(done?.item).toMatchObject({
			type: "function_call",
			id: added?.item?.id,
			name: "gateway_datetime",
			arguments: "{\"timezone\":\"Europe/London\"}",
			status: "completed",
		});
		expect(output).not.toContain("google_empty_response");
	});

	it("emits reasoning_content deltas for Interactions thought summaries", async () => {
		const upstream = makeGoogleSseStream([
			{
				index: 0,
				step: {
					type: "thought",
				},
				event_type: "step.start",
			},
			{
				index: 0,
				delta: {
					type: "thought_summary",
					content: { type: "text", text: "thinking trace" },
				},
				event_type: "step.delta",
			},
			{
				interaction: {
					id: "v1_test",
					status: "completed",
					usage: {
						total_input_tokens: 5,
						total_output_tokens: 3,
						total_tokens: 8,
						total_thought_tokens: 2,
					},
				},
				event_type: "interaction.completed",
			},
		]);

		const stream = transformStream(upstream, baseArgs({
			ir: {
				model: "gemini-3.1-flash-image-preview",
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
				stream: true,
			},
		}));
		const output = await readStreamText(stream);

		expect(output).toContain("\"reasoning_content\":\"thinking trace\"");
	});

	it("counts Interactions thought tokens as output and leaves tool-use tokens out of input", async () => {
		// Google's documented accounting: total = input + output + thoughts; tool-use tokens are
		// not added (function-calling example: input 100, output 25, tool use 50, total 125).
		const upstream = makeGoogleSseStream([
			{ index: 0, step: { type: "model_output" }, event_type: "step.start" },
			{ index: 0, delta: { type: "text", text: "done" }, event_type: "step.delta" },
			{
				interaction: {
					id: "v1_test",
					status: "completed",
					usage: {
						total_input_tokens: 100,
						total_cached_tokens: 40,
						total_output_tokens: 30,
						total_thought_tokens: 20,
						total_tool_use_tokens: 7,
						total_tokens: 150,
						input_tokens_by_modality: [{ modality: "text", tokens: 90 }, { modality: "image", tokens: 10 }],
						cached_tokens_by_modality: [{ modality: "text", tokens: 36 }, { modality: "image", tokens: 4 }],
					},
				},
				event_type: "interaction.completed",
			},
		]);
		const seen: any[] = [];

		const stream = transformStream(upstream, baseArgs(), undefined, { onUsage: (usage) => seen.push(usage) });
		const output = await readStreamText(stream);

		expect(output).toContain("\"prompt_tokens\":100");
		expect(output).toContain("\"completion_tokens\":50");
		expect(output).toContain("\"reasoning_tokens\":20");
		expect(seen.at(-1)).toMatchObject({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
			reasoningTokens: 20,
			cachedInputTokens: 40,
			// The 4 cached image tokens are billed through cachedInputTokens, not again as image input.
			_ext: { inputImageTokens: 6 },
		});
	});

	it("emits image deltas when Interactions stream returns image content", async () => {
		const upstream = makeGoogleSseStream([
			{
				index: 0,
				step: { type: "model_output" },
				event_type: "step.start",
			},
			{
				index: 0,
				delta: {
					type: "image",
					mime_type: "image/png",
					data: "ZmFrZS1pbWFnZQ==",
				},
				event_type: "step.delta",
			},
			{
				interaction: {
					id: "v1_test",
					status: "completed",
					usage: {
						total_input_tokens: 66,
						total_output_tokens: 1536,
						total_tokens: 2027,
						total_thought_tokens: 425,
						output_tokens_by_modality: [
							{ modality: "image", tokens: 1120 },
						],
					},
				},
				event_type: "interaction.completed",
			},
		]);

		const stream = transformStream(upstream, baseArgs());
		const output = await readStreamText(stream);
		expect(output).toContain("\"images\"");
		expect(output).toContain("\"image_url\"");
		expect(output).toContain("data:image/png;base64,ZmFrZS1pbWFnZQ==");
		expect(output).toContain("\"output_tokens_details\"");
		expect(output).toContain("\"output_images\":1120");
	});

	it("emits audio deltas when Interactions stream returns audio content", async () => {
		const upstream = makeGoogleSseStream([
			{
				index: 0,
				step: { type: "model_output" },
				event_type: "step.start",
			},
			{
				index: 0,
				delta: {
					type: "audio",
					mime_type: "audio/wav",
					data: "UklGRlIAAABXQVZFZm10",
				},
				event_type: "step.delta",
			},
			{
				interaction: {
					id: "v1_test",
					status: "completed",
					usage: {
						total_input_tokens: 11,
						total_output_tokens: 22,
						total_tokens: 33,
						output_tokens_by_modality: [
							{ modality: "audio", tokens: 22 },
						],
					},
				},
				event_type: "interaction.completed",
			},
		]);

		const stream = transformStream(upstream, baseArgs());
		const output = await readStreamText(stream);
		expect(output).toContain("\"audios\"");
		expect(output).toContain("\"audio_url\"");
		expect(output).toContain("data:audio/wav;base64,UklGRlIAAABXQVZFZm10");
		expect(output).toContain("\"output_tokens_details\"");
		expect(output).toContain("\"output_audio\":22");
	});

	function functionCallFrame(functionCall: Record<string, unknown>, last = false) {
		return {
			candidates: [{
				index: 0,
				content: { role: "model", parts: [{ functionCall, thoughtSignature: `sig-${String(functionCall.id ?? functionCall.name)}` }] },
				...(last ? { finishReason: "STOP" } : {}),
			}],
			usageMetadata: last
				? { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 }
				: { promptTokenCount: 10 },
		};
	}

	function chatToolCallDeltas(output: string): any[] {
		return output
			.split("\n")
			.filter((line) => line.startsWith("data: {"))
			.map((line) => JSON.parse(line.slice(6)))
			.flatMap((chunk) => chunk.choices ?? [])
			.flatMap((choice: any) => choice.delta?.tool_calls ?? []);
	}

	it("gives parallel function calls in separate frames their own index and keeps upstream ids", async () => {
		const upstream = makeGoogleSseStream([
			functionCallFrame({ id: "call_up_1", name: "get_weather", args: { city: "Lyon" } }),
			functionCallFrame({ id: "call_up_2", name: "search", args: { query: "lyon" } }, true),
		]);

		const deltas = chatToolCallDeltas(await readStreamText(transformStream(upstream, baseArgs())));

		expect(deltas.map((delta) => [delta.index, delta.id, delta.function?.name])).toEqual([
			[0, "call_up_1", "get_weather"],
			[1, "call_up_2", "search"],
		]);
		expect(deltas.map((delta) => delta.function?.arguments)).toEqual([
			"{\"city\":\"Lyon\"}",
			"{\"query\":\"lyon\"}",
		]);
	});

	it("keeps two same-name calls without upstream ids apart and an identical re-send as one call", async () => {
		const upstream = makeGoogleSseStream([
			functionCallFrame({ name: "get_weather", args: { city: "Lyon" } }),
			functionCallFrame({ name: "get_weather", args: { city: "Lyon" } }),
			functionCallFrame({ name: "get_weather", args: { city: "Paris" } }, true),
		]);

		const deltas = chatToolCallDeltas(await readStreamText(transformStream(upstream, baseArgs())));

		expect(deltas.map((delta) => [delta.index, delta.function?.arguments])).toEqual([
			[0, "{\"city\":\"Lyon\"}"],
			[1, "{\"city\":\"Paris\"}"],
		]);
		expect(new Set(deltas.map((delta) => delta.id)).size).toBe(2);
	});

	it("emits one Responses function_call item per parallel Gemini call", async () => {
		const upstream = makeGoogleSseStream([
			functionCallFrame({ id: "call_up_1", name: "get_weather", args: { city: "Lyon" } }),
			functionCallFrame({ id: "call_up_2", name: "search", args: { query: "lyon" } }, true),
		]);

		const output = await readStreamText(transformStream(upstream, baseArgs({
			endpoint: "responses",
			protocol: "openai.responses",
		})));
		const done = parseSseEvents(output)
			.filter((event) => event.event === "response.output_item.done" && event.data.item?.type === "function_call")
			.map((event) => event.data.item);

		expect(done.map((item) => [item.call_id, item.name, item.arguments])).toEqual([
			["call_up_1", "get_weather", "{\"city\":\"Lyon\"}"],
			["call_up_2", "search", "{\"query\":\"lyon\"}"],
		]);
	});
});
