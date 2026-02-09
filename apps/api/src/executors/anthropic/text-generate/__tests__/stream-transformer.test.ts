import { describe, expect, it } from "vitest";
import { createAnthropicToResponsesStreamTransformer } from "../stream-transformer";

function makeAnthropicSseStream(events: any[]): ReadableStream<Uint8Array> {
	const body = events
		.map((event) => `data: ${JSON.stringify(event)}\n\n`)
		.join("");
	return new Response(body, {
		headers: { "Content-Type": "text/event-stream" },
	}).body as ReadableStream<Uint8Array>;
}

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return await new Response(stream).text();
}

describe("anthropic stream transformer", () => {
	it("emits output_item.done for tool_use blocks", async () => {
		const upstream = makeAnthropicSseStream([
			{
				type: "message_start",
				message: {
					id: "msg_123",
					usage: { input_tokens: 10, output_tokens: 0 },
				},
			},
			{
				type: "content_block_start",
				index: 0,
				content_block: {
					type: "tool_use",
					id: "toolu_123",
					name: "get_weather",
				},
			},
			{
				type: "content_block_delta",
				index: 0,
				delta: {
					type: "input_json_delta",
					partial_json: "{\"city\":\"SF\"}",
				},
			},
			{
				type: "content_block_stop",
				index: 0,
			},
			{
				type: "message_delta",
				delta: { stop_reason: "tool_use" },
				usage: { output_tokens: 7 },
			},
			{
				type: "message_stop",
			},
		]);

		const transformed = upstream.pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_stream_test", "claude-sonnet"),
		);
		const output = await readStreamText(transformed);

		expect(output).toContain("event: response.output_item.added");
		expect(output).toContain("event: response.function_call_arguments.delta");
		expect(output).toContain("event: response.function_call_arguments.done");
		expect(output).toContain("event: response.output_item.done");
	});
});
