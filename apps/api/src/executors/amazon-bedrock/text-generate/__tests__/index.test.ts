import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { parseSseJson, readSseFrames } from "../../../../../tests/helpers/sse";

function buildArgs(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_bedrock_test",
		teamId: "team_test",
		providerId: "amazon-bedrock",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: {
			provider: "amazon-bedrock",
			model: ir.model,
			endpoint: "chat.completions",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [],
		},
		meta: {
			returnUsage: true,
			returnMeta: false,
		} as any,
		...overrides,
	} as ExecutorExecuteArgs;
}

function writeUInt32BE(buffer: Uint8Array, offset: number, value: number) {
	buffer[offset] = (value >>> 24) & 0xff;
	buffer[offset + 1] = (value >>> 16) & 0xff;
	buffer[offset + 2] = (value >>> 8) & 0xff;
	buffer[offset + 3] = value & 0xff;
}

function writeUInt16BE(buffer: Uint8Array, offset: number, value: number) {
	buffer[offset] = (value >>> 8) & 0xff;
	buffer[offset + 1] = value & 0xff;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function encodeHeaderString(name: string, value: string): Uint8Array {
	const encoder = new TextEncoder();
	const nameBytes = encoder.encode(name);
	const valueBytes = encoder.encode(value);
	const out = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length);
	let offset = 0;
	out[offset++] = nameBytes.length;
	out.set(nameBytes, offset);
	offset += nameBytes.length;
	out[offset++] = 7; // string type
	writeUInt16BE(out, offset, valueBytes.length);
	offset += 2;
	out.set(valueBytes, offset);
	return out;
}

function encodeBedrockEventFrame(eventType: string, data: any): Uint8Array {
	const encoder = new TextEncoder();
	const headers = concatBytes([
		encodeHeaderString(":message-type", "event"),
		encodeHeaderString(":event-type", eventType),
		encodeHeaderString(":content-type", "application/json"),
	]);
	const payload = encoder.encode(JSON.stringify({ [eventType]: data }));

	const totalLen = 12 + headers.length + payload.length + 4;
	const out = new Uint8Array(totalLen);
	writeUInt32BE(out, 0, totalLen);
	writeUInt32BE(out, 4, headers.length);
	writeUInt32BE(out, 8, 0); // prelude CRC omitted in tests
	out.set(headers, 12);
	out.set(payload, 12 + headers.length);
	writeUInt32BE(out, totalLen - 4, 0); // message CRC omitted in tests
	return out;
}

function bedrockStreamResponse(events: Array<{ type: string; data: any }>, init?: ResponseInit): Response {
	const body = concatBytes(events.map((event) => encodeBedrockEventFrame(event.type, event.data)));
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(body);
			controller.close();
		},
	});
	return new Response(stream, {
		status: init?.status ?? 200,
		headers: {
			"Content-Type": "application/vnd.amazon.eventstream",
			...(init?.headers ?? {}),
		},
	});
}

function basicBedrockTextEvents(
	text: string,
	stopReason = "end_turn",
	usage: { inputTokens: number; outputTokens: number; totalTokens: number } = {
		inputTokens: 8,
		outputTokens: 2,
		totalTokens: 10,
	},
): Array<{ type: string; data: any }> {
	return [
		{
			type: "messageStart",
			data: { role: "assistant" },
		},
		{
			type: "contentBlockDelta",
			data: {
				contentBlockIndex: 0,
				delta: { text },
			},
		},
		{
			type: "messageStop",
			data: { stopReason },
		},
		{
			type: "metadata",
			data: { usage },
		},
	];
}

describe("amazon-bedrock text executor", () => {
	beforeAll(() => {
		setupTestRuntime();
	});

	afterAll(() => {
		teardownTestRuntime();
	});

	it("routes OpenAI Bedrock models to /openai/v1/chat/completions", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/chat/completions"),
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe("openai.gpt-oss-20b-1:0");
				expect(call.bodyJson?.messages?.[0]?.role).toBe("user");
				expect(call.bodyJson?.stream).toBe(true);
			},
			response: jsonResponse({
				id: "chatcmpl_bedrock",
				object: "chat.completion",
				created: 1710000000,
				model: "openai.gpt-oss-20b-1:0",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "hello" },
					finish_reason: "stop",
				}],
				usage: {
					prompt_tokens: 4,
					completion_tokens: 2,
					total_tokens: 6,
				},
			}, {
				headers: {
					"x-amzn-requestid": "bedrock-openai-req",
				},
			}),
		}]);

		const result = await execute(buildArgs({
			model: "openai.gpt-oss-20b-1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}));

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("falls back from /responses to /chat/completions when responses is unavailable", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/openai/v1/responses"),
				response: jsonResponse({
					error: {
						message: "unknown endpoint /responses",
					},
				}, { status: 404 }),
			},
			{
				match: (url) => url.endsWith("/openai/v1/chat/completions"),
				response: jsonResponse({
					id: "chatcmpl_bedrock_fallback",
					object: "chat.completion",
					created: 1710000001,
					model: "openai.gpt-oss-20b-1:0",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "fallback ok" },
						finish_reason: "stop",
					}],
					usage: {
						prompt_tokens: 4,
						completion_tokens: 2,
						total_tokens: 6,
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai.gpt-oss-20b-1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));

		mock.restore();

		expect(mock.calls[0]?.url.endsWith("/openai/v1/responses")).toBe(true);
		expect(mock.calls[1]?.url.endsWith("/openai/v1/chat/completions")).toBe(true);
		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("keeps Converse for non-openai models and maps media URLs to bytes", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://example.com/image.png",
				response: new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "Content-Type": "image/png", "Content-Length": "3" },
				}),
			},
			{
				match: (url) => url === "https://example.com/audio.mp3",
				response: new Response(new Uint8Array([4, 5, 6]), {
					status: 200,
					headers: { "Content-Type": "audio/mpeg", "Content-Length": "3" },
				}),
			},
			{
				match: (url) => url === "https://example.com/video.mp4",
				response: new Response(new Uint8Array([7, 8, 9]), {
					status: 200,
					headers: { "Content-Type": "video/mp4", "Content-Length": "3" },
				}),
			},
			{
				match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
				onRequest: (call) => {
					const content = call.bodyJson?.messages?.[0]?.content ?? [];
					const image = content.find((item: any) => item?.image);
					const audio = content.find((item: any) => item?.audio);
					const video = content.find((item: any) => item?.video);
					expect(typeof image?.image?.source?.bytes).toBe("string");
					expect(typeof audio?.audio?.source?.bytes).toBe("string");
					expect(typeof video?.video?.source?.bytes).toBe("string");
				},
				response: bedrockStreamResponse(
					basicBedrockTextEvents(
						"ok",
						"end_turn",
						{ inputTokens: 10, outputTokens: 2, totalTokens: 12 },
					),
				),
			},
		]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: false,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "analyze media" },
					{ type: "image", source: "url", data: "https://example.com/image.png" },
					{ type: "audio", source: "url", data: "https://example.com/audio.mp3", format: "mp3" },
					{ type: "video", source: "url", url: "https://example.com/video.mp4" },
				],
			}],
		}));

		mock.restore();

		expect(mock.calls.some((call) => call.url.includes("/converse-stream"))).toBe(true);
		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("routes Amazon Nova models to Converse", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/model/amazon.nova-pro-v1%3A0/converse-stream"),
			response: bedrockStreamResponse(basicBedrockTextEvents("nova ok")),
		}]);

		const result = await execute(buildArgs({
			model: "amazon.nova-pro-v1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello nova" }] }],
		}));

		mock.restore();

		expect(mock.calls[0]?.url.includes("/converse-stream")).toBe(true);
		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("normalizes /openai/v1 base URL for Converse Anthropic models", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream",
			response: bedrockStreamResponse(basicBedrockTextEvents("anthropic ok")),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello anthropic" }] }],
		}, {
			byokMeta: [{
				id: "byok_1",
				providerId: "amazon-bedrock",
				fingerprintSha256: "x",
				keyVersion: null,
				alwaysUse: true,
				key: JSON.stringify({
					accessKeyId: "AKIA_TEST",
					secretAccessKey: "SECRET_TEST",
					region: "us-east-1",
					baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1",
				}),
			}] as any,
		}));

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("falls back to Converse when ConverseStream is unavailable", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
				response: new Response("stream_not_supported", { status: 404 }),
			},
			{
				match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse"),
				response: jsonResponse({
					output: {
						message: {
							content: [{ text: "fallback ok" }],
						},
					},
					stopReason: "end_turn",
					usage: {
						inputTokens: 8,
						outputTokens: 2,
						totalTokens: 10,
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}));

		mock.restore();

		expect(mock.calls[0]?.url.includes("/converse-stream")).toBe(true);
		expect(mock.calls[1]?.url.includes("/converse")).toBe(true);
		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("streams Converse events as chat chunks through the protocol surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
			response: bedrockStreamResponse([
				{
					type: "messageStart",
					data: { role: "assistant" },
				},
				{
					type: "contentBlockDelta",
					data: {
						contentBlockIndex: 0,
						delta: { text: "Hello stream" },
					},
				},
				{
					type: "messageStop",
					data: { stopReason: "end_turn" },
				},
				{
					type: "metadata",
					data: {
						usage: {
							inputTokens: 8,
							outputTokens: 3,
							totalTokens: 11,
						},
					},
				},
			], {
				headers: { "x-amzn-requestid": "bedrock_stream_req_1" },
			}),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}));

		mock.restore();

		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;

		const frames = parseSseJson(await readSseFrames(new Response(result.stream)));
		const chunks = frames.filter((frame) => frame !== "[DONE]") as any[];
		expect(chunks.some((chunk) => chunk?.choices?.[0]?.delta?.content === "Hello stream")).toBe(true);
		expect(chunks.some((chunk) => chunk?.choices?.[0]?.finish_reason === "stop")).toBe(true);
		expect(chunks.some((chunk) => chunk?.usage?.total_tokens === 11)).toBe(true);
	});

	it("streams Converse events to responses surface via IR normalization", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
			response: bedrockStreamResponse([
				{
					type: "messageStart",
					data: { role: "assistant" },
				},
				{
					type: "contentBlockDelta",
					data: {
						contentBlockIndex: 0,
						delta: { text: "Responses stream" },
					},
				},
				{
					type: "messageStop",
					data: { stopReason: "end_turn" },
				},
			]),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));

		mock.restore();

		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;

		const frames = parseSseJson(await readSseFrames(new Response(result.stream)));
		const responsePayload = frames.find((frame: any) => frame?.response?.output && Array.isArray(frame.response.output)) as any;
		expect(responsePayload?.response?.output?.length).toBeGreaterThan(0);
	});

	it("streams Converse tool-call deltas on chat surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
			response: bedrockStreamResponse([
				{
					type: "messageStart",
					data: { role: "assistant" },
				},
				{
					type: "contentBlockStart",
					data: {
						contentBlockIndex: 0,
						start: {
							toolUse: {
								toolUseId: "tool_1",
								name: "get_weather",
							},
						},
					},
				},
				{
					type: "contentBlockDelta",
					data: {
						contentBlockIndex: 0,
						delta: {
							toolUse: {
								inputJson: "{\"city\":\"",
							},
						},
					},
				},
				{
					type: "contentBlockDelta",
					data: {
						contentBlockIndex: 0,
						delta: {
							toolUse: {
								inputJson: "SF\"}",
							},
						},
					},
				},
				{
					type: "messageStop",
					data: { stopReason: "tool_use" },
				},
			]),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "call tool" }] }],
		}));

		mock.restore();

		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;

		const frames = parseSseJson(await readSseFrames(new Response(result.stream)));
		const chunks = frames.filter((frame) => typeof frame === "object") as any[];
		const toolDeltas = chunks
			.flatMap((chunk) => chunk?.choices?.[0]?.delta?.tool_calls ?? [])
			.map((tool: any) => String(tool?.function?.arguments ?? ""));

		expect(chunks.some((chunk) => chunk?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.name === "get_weather")).toBe(true);
		expect(toolDeltas.join("")).toContain("{\"city\":\"SF\"}");
		expect(chunks.some((chunk) => chunk?.choices?.[0]?.finish_reason === "tool_calls")).toBe(true);
	});

	it("streams Converse tool-call deltas to responses surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/model/anthropic.claude-3-5-sonnet-v1%3A0/converse-stream"),
			response: bedrockStreamResponse([
				{
					type: "messageStart",
					data: { role: "assistant" },
				},
				{
					type: "contentBlockStart",
					data: {
						contentBlockIndex: 0,
						start: {
							toolUse: {
								toolUseId: "tool_2",
								name: "get_weather",
							},
						},
					},
				},
				{
					type: "contentBlockDelta",
					data: {
						contentBlockIndex: 0,
						delta: {
							toolUse: {
								inputJson: "{\"city\":\"SF\"}",
							},
						},
					},
				},
				{
					type: "messageStop",
					data: { stopReason: "tool_use" },
				},
			]),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-3-5-sonnet-v1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "call tool" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));

		mock.restore();

		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;

		const frames = parseSseJson(await readSseFrames(new Response(result.stream)));
		const completed = frames.find((frame: any) => frame?.response?.output && Array.isArray(frame.response.output)) as any;
		const functionCall = completed?.response?.output?.find((item: any) => item?.type === "function_call");
		expect(functionCall?.name).toBe("get_weather");
		expect(String(functionCall?.arguments ?? "")).toContain("\"city\":\"SF\"");
	});
});
