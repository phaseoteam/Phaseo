import { describe, expect, it } from "vitest";
import { transformStream } from "../index";

function makeGeminiSseStream(payloads: any[]): ReadableStream<Uint8Array> {
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
		teamId: "team_test",
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
	it("emits chat tool_call deltas from Gemini functionCall parts", async () => {
		const upstream = makeGeminiSseStream([
			{
				candidates: [{
					index: 0,
					content: {
						parts: [{
							functionCall: {
								name: "get_weather",
								args: { city: "SF" },
							},
						}],
					},
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 5,
					candidatesTokenCount: 3,
					totalTokenCount: 8,
				},
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
		const upstream = makeGeminiSseStream([
			{
				candidates: [{
					index: 0,
					content: {
						parts: [{
							functionCall: {
								name: "get_weather",
								partialArgs: "{\"city\":\"",
							},
						}],
					},
				}],
			},
			{
				candidates: [{
					index: 0,
					content: {
						parts: [{
							functionCall: {
								name: "get_weather",
								partialArgs: "SF\"}",
							},
						}],
					},
					finishReason: "STOP",
				}],
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

	it("emits image deltas when Gemini stream returns inlineData image parts", async () => {
		const upstream = makeGeminiSseStream([
			{
				candidates: [{
					index: 0,
					content: {
						parts: [{
							inlineData: {
								mimeType: "image/png",
								data: "ZmFrZS1pbWFnZQ==",
							},
						}],
					},
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 66,
					candidatesTokenCount: 1536,
					totalTokenCount: 2027,
					thoughtsTokenCount: 425,
					candidatesTokensDetails: [
						{ modality: "IMAGE", tokenCount: 1120 },
					],
				},
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
});
