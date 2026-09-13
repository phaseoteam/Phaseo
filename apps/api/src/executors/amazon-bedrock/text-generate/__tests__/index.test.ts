import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { assertBedrockMantleBaseUrl } from "../bedrock-utils";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { parseSseJson, readSseFrames, sseResponse } from "../../../../../tests/helpers/sse";

function buildArgs(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_bedrock_test",
		workspaceId: "team_test",
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

	it("rejects a legacy Bedrock Runtime base URL", () => {
		expect(() => assertBedrockMantleBaseUrl("https://bedrock-runtime.us-east-1.amazonaws.com"))
			.toThrow("amazon_bedrock_mantle_endpoint_required");
		expect(() => assertBedrockMantleBaseUrl("https://api.openai.com/v1"))
			.toThrow("amazon_bedrock_mantle_endpoint_required");
		expect(() => assertBedrockMantleBaseUrl("https://bedrock-mantle.eu-west-2.api.aws"))
			.not.toThrow();
		expect(() => assertBedrockMantleBaseUrl("https://bedrock-mantle.eu-west-2.amazonaws.com"))
			.not.toThrow();
	});

	it("signs Mantle AWS-credential requests with the Bedrock SigV4 service", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/chat/completions"),
			onRequest: (call) => {
				expect(call.headers.Authorization).toContain("/us-east-1/bedrock/aws4_request");
				expect(call.headers["X-Amz-Date"]).toMatch(/^\d{8}T\d{6}Z$/);
				expect(call.headers["X-Amz-Content-Sha256"]).toMatch(/^[a-f0-9]{64}$/);
			},
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);
		const credentials = JSON.stringify({
			accessKeyId: "AKIATEST",
			secretAccessKey: "secret",
			region: "us-east-1",
			baseUrl: "https://api.bedrock.example",
		});
		const result = await execute(buildArgs({
			model: "openai.gpt-oss-20b-1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, {
			byokMeta: [{ id: "byok_aws", key: credentials, providerId: "amazon-bedrock", alwaysUse: true }] as any,
		}));
		mock.restore();
		expect(result.kind).toBe("stream");
	});

	it("derives the SigV4 region from a BYOK Mantle URL before the gateway default", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AMAZON_BEDROCK_REGION: "us-west-2",
			AMAZON_BEDROCK_MANTLE_BASE_URL: "https://bedrock-mantle.us-west-2.api.aws",
			AMAZON_BEDROCK_API_KEY: "test-bedrock-key",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/chat/completions"),
			onRequest: (call) => {
				expect(call.headers.Authorization).toContain("/us-east-1/bedrock/aws4_request");
			},
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);
		try {
			const credentials = JSON.stringify({
				accessKeyId: "AKIATEST",
				secretAccessKey: "secret",
				baseUrl: "https://bedrock-mantle.us-east-1.api.aws",
			});
			const result = await execute(buildArgs({
				model: "openai.gpt-oss-20b-1:0",
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			}, {
				byokMeta: [{ id: "byok_aws", key: credentials, providerId: "amazon-bedrock", alwaysUse: true }] as any,
			}));
			expect(result.kind).toBe("stream");
		} finally {
			mock.restore();
			teardownTestRuntime();
			setupTestRuntime();
		}
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

	it.each([
		{
			client: "Chat Completions",
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			path: "/openai/v1/chat/completions",
			response: {
				id: "chatcmpl_claude", model: "anthropic.claude-sonnet-5",
				choices: [{ index: 0, message: { role: "assistant", content: "mantle ok" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
			},
		},
		{
			client: "Responses",
			endpoint: "responses",
			protocol: "openai.responses",
			path: "/openai/v1/responses",
			response: {
				id: "resp_claude", object: "response", model: "anthropic.claude-sonnet-5", status: "completed",
				output: [{ id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "mantle ok", annotations: [] }] }],
				usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
			},
		},
	])("preserves the $client protocol for Claude Sonnet 5", async ({ endpoint, protocol, path, response }) => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith(path),
			onRequest: (call) => {
				expect(call.headers.Authorization).toBe("Bearer test-bedrock-key");
				expect(call.bodyJson?.model).toBe("anthropic.claude-sonnet-5");
				expect(call.bodyJson?.stream).toBe(true);
			},
			response: jsonResponse(response, { headers: { "x-amzn-requestid": "bedrock-mantle-req" } }),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-sonnet-5",
			stream: false,
			maxTokens: 512,
			messages: [{ role: "user", content: [{ type: "text", text: "hello mantle" }] }],
		}, {
			endpoint,
			protocol,
		}));

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
		expect((result.ir?.choices?.[0]?.message?.content?.[0] as any)?.text).toBe("mantle ok");
		expect(result.bill.upstream_id).toBe("bedrock-mantle-req");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url.endsWith(path)).toBe(true);
	});

	it("uses Mantle Messages for Claude models beyond Sonnet 5", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/anthropic/v1/messages"),
			response: jsonResponse({
				id: "msg_bedrock_opus",
				type: "message",
				role: "assistant",
				model: "anthropic.claude-opus-4-6-v1:0",
				content: [{ type: "text", text: "mantle native" }],
				stop_reason: "end_turn",
				usage: { input_tokens: 3, output_tokens: 2 },
			}),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-opus-4-6-v1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, { endpoint: "messages", protocol: "anthropic.messages" }));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.url).toContain("/anthropic/v1/messages");
	});

	it("keeps Claude JSON Schema requests on the requested Responses surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/responses"),
			onRequest: (call) => {
				expect(call.bodyJson?.text?.format?.type).toBe("json_schema");
				expect(call.bodyJson?.store).toBe(true);
				expect(call.bodyJson?.previous_response_id).toBe("resp_previous");
			},
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);
		const result = await execute(buildArgs({
			model: "anthropic.claude-sonnet-5",
			stream: true,
			responseFormat: {
				type: "json_schema",
				name: "answer",
				schema: { type: "object", properties: { answer: { type: "string" } } },
			},
			store: true,
			previousResponseId: "resp_previous",
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));
		mock.restore();
		expect(result.kind).toBe("stream");
	});

	it("streams Claude Sonnet 5 on the Anthropic Messages protocol", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.bedrock.example/anthropic/v1/messages",
			onRequest: (call) => {
				expect(call.headers["x-api-key"]).toBe("test-bedrock-key");
				expect(call.headers["anthropic-version"]).toBe("2023-06-01");
				expect(call.bodyJson?.model).toBe("anthropic.claude-sonnet-5-v1:0");
				expect(call.bodyJson?.stream).toBe(true);
			},
			response: () => sseResponse([
				{
					type: "message_start",
					message: {
						id: "msg_bedrock_stream",
						type: "message",
						role: "assistant",
						model: "anthropic.claude-sonnet-5-v1:0",
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage: { input_tokens: 4, output_tokens: 0 },
					},
				},
				{
					type: "content_block_start",
					index: 0,
					content_block: { type: "text", text: "" },
				},
				{
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: "streamed" },
				},
				{ type: "content_block_stop", index: 0 },
				{
					type: "message_delta",
					delta: { stop_reason: "end_turn", stop_sequence: null },
					usage: { output_tokens: 2 },
				},
				{ type: "message_stop" },
			]),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-sonnet-5-v1:0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "stream please" }] }],
		}, {
			endpoint: "messages",
			protocol: "anthropic.messages",
		}));

		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") {
			mock.restore();
			throw new Error("expected_stream_result");
		}
		const frames = await readSseFrames(new Response(result.stream));
		const payloads = parseSseJson(frames);
		mock.restore();

		expect(payloads.some((payload) => payload?.delta?.text === "streamed" || payload?.delta === "streamed")).toBe(true);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).not.toContain("/chat/completions");
		expect(mock.calls[0]?.url).not.toMatch(/\/v1\/responses$/);
	});

	it("keeps GPT-5.6 models on the requested Chat surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/chat/completions"),
			onRequest: (call) => {
				expect(call.bodyJson?.messages).toBeDefined();
			},
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);

		const result = await execute(buildArgs({
			model: "openai.gpt-5.6-sol",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}));

		mock.restore();
		expect(result.kind).toBe("stream");
		expect(mock.calls[0]?.url.endsWith("/openai/v1/chat/completions")).toBe(true);
	});

	it("routes GPT-6 Astra through the requested Mantle Responses surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/responses"),
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe("openai.gpt-6-astra");
				expect(call.bodyJson?.stream).toBe(true);
			},
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);

		const result = await execute(buildArgs({
			model: "openai.gpt-6-astra",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello Astra" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));

		mock.restore();
		expect(result.kind).toBe("stream");
		expect(mock.calls).toHaveLength(1);
	});

	it("does not change endpoints when /responses is unavailable", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/openai/v1/responses"),
				response: jsonResponse({
					error: {
						message: "unknown endpoint /responses",
					},
				}, { status: 404 }),
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
		expect(mock.calls).toHaveLength(1);
		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(404);
	});

});
