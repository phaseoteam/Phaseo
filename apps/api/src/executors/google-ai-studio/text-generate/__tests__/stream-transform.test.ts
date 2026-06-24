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
});
