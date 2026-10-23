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

function encodeEventStreamFrame(headerPairs: Array<[string, string]>, payloadText: string): Uint8Array {
	const headers = concatBytes(headerPairs.map(([name, value]) => encodeHeaderString(name, value)));
	const payload = new TextEncoder().encode(payloadText);
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

/** An InvokeModelWithResponseStream `chunk` frame carrying one Anthropic event. */
function invokeChunkFrame(event: Record<string, unknown>): Uint8Array {
	const bytes = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(event))));
	return encodeEventStreamFrame([
		[":message-type", "event"],
		[":event-type", "chunk"],
		[":content-type", "application/json"],
	], JSON.stringify({ bytes }));
}

/** Delivers the frames split at awkward offsets, as a network would. */
function eventStreamResponse(frames: Uint8Array[]): Response {
	const body = concatBytes(frames);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let offset = 0; offset < body.length; offset += 7) controller.enqueue(body.slice(offset, offset + 7));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "application/vnd.amazon.eventstream", "x-amzn-requestid": "bedrock-runtime-req" },
	});
}

const CLAUDE_STREAM_EVENTS = [
	{
		type: "message_start",
		message: {
			id: "msg_bdrk_runtime",
			type: "message",
			role: "assistant",
			model: "claude-opus-4-6",
			content: [],
			stop_reason: null,
			stop_sequence: null,
			usage: { input_tokens: 9, output_tokens: 1 },
		},
	},
	{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
	{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "runtime streamed" } },
	{ type: "content_block_stop", index: 0 },
	{ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } },
	{ type: "message_stop", "amazon-bedrock-invocationMetrics": { inputTokenCount: 9, outputTokenCount: 3 } },
];

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

	it("signs Mantle AWS-credential requests with the bedrock-mantle SigV4 service", async () => {
		// count-tokens.html: "a SigV4 signature with service name bedrock-mantle".
		const mock = installFetchMock([{
			match: (url) => url === "https://api.bedrock.example/v1/chat/completions",
			onRequest: (call) => {
				expect(call.headers.Authorization).toContain("/us-east-1/bedrock-mantle/aws4_request");
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
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.headers.Authorization).toContain("/bedrock-mantle/aws4_request");
	});

	it("derives the SigV4 region from a BYOK Mantle URL before the gateway default", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AMAZON_BEDROCK_REGION: "us-west-2",
			AMAZON_BEDROCK_MANTLE_BASE_URL: "https://bedrock-mantle.us-west-2.api.aws",
			AMAZON_BEDROCK_API_KEY: "test-bedrock-key",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url === "https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions",
			onRequest: (call) => {
				expect(call.headers.Authorization).toContain("/us-east-1/bedrock-mantle/aws4_request");
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
			expect(mock.calls).toHaveLength(1);
		} finally {
			mock.restore();
			teardownTestRuntime();
			setupTestRuntime();
		}
	});

	it("routes gpt-oss to Mantle /v1/chat/completions", async () => {
		// gpt-oss-120b card: "On bedrock-mantle, both APIs use the /v1 base path, not /openai/v1."
		const mock = installFetchMock([{
			match: (url) => url === "https://api.bedrock.example/v1/chat/completions",
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
		expect(mock.calls).toHaveLength(1);
	});

	it.each([
		{ model: "openai.gpt-5.4", endpoint: "chat.completions", protocol: "openai.chat.completions", path: "/openai/v1/chat/completions" },
		{ model: "openai.gpt-5.6-luna", endpoint: "responses", protocol: "openai.responses", path: "/openai/v1/responses" },
		{ model: "xai.grok-4.3", endpoint: "responses", protocol: "openai.responses", path: "/openai/v1/responses" },
		{ model: "xai.grok-4.3", endpoint: "chat.completions", protocol: "openai.chat.completions", path: "/openai/v1/chat/completions" },
		{ model: "openai.gpt-oss-120b", endpoint: "responses", protocol: "openai.responses", path: "/v1/responses" },
		{ model: "google.gemma-3-27b-it", endpoint: "chat.completions", protocol: "openai.chat.completions", path: "/v1/chat/completions" },
	])("sends $model $protocol clients to Mantle $path", async ({ model, endpoint, protocol, path }) => {
		// GPT-5.4 card: "On bedrock-mantle, both APIs use the /openai/v1 base path, not /v1."
		// Grok 4.3 card: "served at /openai/v1/responses, not the default /v1/responses".
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AMAZON_BEDROCK_REGION: "us-west-2",
			AMAZON_BEDROCK_MANTLE_BASE_URL: "https://bedrock-mantle.us-west-2.api.aws",
			AMAZON_BEDROCK_API_KEY: "test-bedrock-key",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://bedrock-mantle.us-west-2.api.aws/"),
			response: () => new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			}, { endpoint: endpoint as any, protocol: protocol as any, providerModelSlug: model }));
			expect(result.kind).toBe("stream");
			expect(mock.calls.map((call) => call.url)).toEqual([`https://bedrock-mantle.us-west-2.api.aws${path}`]);
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-bedrock-key");
		} finally {
			mock.restore();
			teardownTestRuntime();
			setupTestRuntime();
		}
	});

	it.each([
		{ model: "google.gemma-3-12b-it", endpoint: "messages", protocol: "anthropic.messages" },
		{ model: "openai.gpt-5.4", endpoint: "messages", protocol: "anthropic.messages" },
		{ model: "google.gemma-3-12b-it", endpoint: "responses", protocol: "openai.responses" },
		{ model: "qwen.qwen3-32b", endpoint: "responses", protocol: "openai.responses" },
	])("translates $protocol clients of $model through Chat Completions", async ({ model, endpoint, protocol }) => {
		// count-tokens.html: non-Anthropic models return "does not support the
		// '/anthropic/v1/messages' API"; open-weight cards mark Responses "not supported".
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/chat/completions"),
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe(model);
				expect(call.bodyJson?.messages?.[0]).toMatchObject({ role: "user" });
			},
			response: () => sseResponse([
				{ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta: { role: "assistant", content: "chat ok" }, finish_reason: null }] },
				{ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
				{ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model, choices: [], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } },
			]),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			}, { endpoint: endpoint as any, protocol: protocol as any, providerModelSlug: model }));
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.url).not.toContain("/anthropic/");
			expect(mock.calls[0]?.url).not.toMatch(/\/responses$/);
			if (result.kind !== "stream") throw new Error("expected_stream_result");
			const text = await new Response(result.stream).text();
			expect(text).toContain("chat ok");
			if (protocol === "anthropic.messages") expect(text).toContain("event: message_start");
			else expect(text).toContain("response.output_text.delta");
		} finally {
			mock.restore();
		}
	});

	it.each([
		{ model: "global.anthropic.claude-opus-4-6-v1", path: "/model/global.anthropic.claude-opus-4-6-v1/invoke" },
		{ model: "us.anthropic.claude-opus-4-1-20250805-v1:0", path: "/model/us.anthropic.claude-opus-4-1-20250805-v1%3A0/invoke" },
	])("sends inference-profile Claude $model to bedrock-runtime InvokeModel", async ({ model, path }) => {
		// Opus 4.1/4.6 and Sonnet 4.5/4.6 are not served by bedrock-mantle; on
		// bedrock-runtime their cards list Converse and Invoke, not Messages.
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://bedrock-runtime.us-west-2.amazonaws.com/"),
			response: () => jsonResponse({
				id: "msg_bdrk_runtime",
				type: "message",
				role: "assistant",
				model: "claude-opus-4-6",
				content: [{ type: "text", text: "runtime ok" }],
				stop_reason: "end_turn",
				usage: { input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 2 },
			}, { headers: { "x-amzn-requestid": "bedrock-runtime-req" } }),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: false,
				maxTokens: 256,
				messages: [{ role: "user", content: [{ type: "text", text: "hello runtime" }] }],
			}, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(mock.calls.map((call) => call.url)).toEqual([`https://bedrock-runtime.us-west-2.amazonaws.com${path}`]);
			const call = mock.calls[0]!;
			expect(call.headers.Authorization).toBe("Bearer test-bedrock-key");
			expect(call.headers["x-api-key"]).toBeUndefined();
			expect(call.headers["anthropic-version"]).toBeUndefined();
			expect(call.bodyJson).toMatchObject({
				anthropic_version: "bedrock-2023-05-31",
				max_tokens: 256,
				messages: [{ role: "user", content: [{ type: "text", text: "hello runtime" }] }],
			});
			expect(call.bodyJson).not.toHaveProperty("model");
			expect(call.bodyJson).not.toHaveProperty("stream");
			expect(result.kind).toBe("completed");
			expect((result.ir?.choices?.[0]?.message?.content?.[0] as any)?.text).toBe("runtime ok");
			expect(result.bill.upstream_id).toBe("bedrock-runtime-req");
			expect(result.bill.usage).toMatchObject({ cached_read_text_tokens: 100 });
		} finally {
			mock.restore();
		}
	});

	it("sends bedrock-runtime InvokeModel only the documented body fields, with betas in anthropic_beta", async () => {
		// model-parameters-anthropic-claude-messages-request-response.html documents the
		// body; compaction page: `anthropic_beta: ["compact-2026-01-12"]` with context_management.
		const model = "global.anthropic.claude-sonnet-4-6";
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://bedrock-runtime.us-west-2.amazonaws.com/model/"),
			response: () => jsonResponse({
				id: "msg", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
			}),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: false,
				userId: "end-user-1",
				metadata: { user_id: "end-user-1" },
				serviceTier: "standard",
				temperature: 0.2,
				stop: ["END"],
				anthropicContextManagement: { edits: [{ type: "compact_20260112" }, { type: "clear_tool_uses_20250919" }] },
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(result.kind).toBe("completed");
			const body = mock.calls[0]?.bodyJson;
			expect(Object.keys(body).sort()).toEqual([
				"anthropic_beta",
				"anthropic_version",
				"context_management",
				"max_tokens",
				"messages",
				"stop_sequences",
				"temperature",
			]);
			expect(body.anthropic_beta).toEqual(["compact-2026-01-12", "context-management-2025-06-27"]);
			expect(mock.calls[0]?.headers["anthropic-beta"]).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it("adds the effort beta for Claude Opus 4.5 on bedrock-runtime", async () => {
		// Request page: Opus 4.5 effort "you must pass the beta header effort-2025-11-24".
		const model = "global.anthropic.claude-opus-4-5-20251101-v1:0";
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://bedrock-runtime.us-west-2.amazonaws.com/model/"),
			response: () => jsonResponse({
				id: "msg", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
			}),
		}]);
		try {
			await execute(buildArgs({
				model,
				stream: false,
				reasoning: { effort: "medium" },
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			const body = mock.calls[0]?.bodyJson;
			expect(body.output_config?.effort).toBe("medium");
			expect(body.anthropic_beta).toEqual(["effort-2025-11-24"]);
		} finally {
			mock.restore();
		}
	});

	it.each([
		{ geo: { inferenceGeo: "us" }, label: "inference_geo us" },
		{ geo: { requiredExecutionRegion: "us" }, label: "a US execution region" },
	])("refuses $label on a global bedrock-runtime profile instead of running it globally", async ({ geo }) => {
		const model = "global.anthropic.claude-sonnet-4-6";
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse({}) }]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: false,
				geo,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(mock.calls).toHaveLength(0);
			expect(result.kind).toBe("completed");
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "inference_geo_unsupported" });
		} finally {
			mock.restore();
		}
	});

	it("keeps US-only requests on a us. bedrock-runtime profile, without sending inference_geo", async () => {
		const model = "us.anthropic.claude-sonnet-4-6";
		const mock = installFetchMock([{
			match: (url) => url === `https://bedrock-runtime.us-west-2.amazonaws.com/model/${model}/invoke`,
			response: () => jsonResponse({
				id: "msg", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
			}),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: false,
				geo: { inferenceGeo: "us" },
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.bodyJson).not.toHaveProperty("inference_geo");
		} finally {
			mock.restore();
		}
	});

	it("refuses fast mode on bedrock-runtime instead of dropping it", async () => {
		const model = "global.anthropic.claude-opus-4-6-v1";
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse({}) }]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: false,
				serviceTier: "priority",
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "service_tier_unsupported" });
		} finally {
			mock.restore();
		}
	});

	it("decodes the bedrock-runtime event stream for streamed Claude requests", async () => {
		const model = "global.anthropic.claude-sonnet-4-6";
		const mock = installFetchMock([{
			match: (url) => url === `https://bedrock-runtime.us-west-2.amazonaws.com/model/${model}/invoke-with-response-stream`,
			onRequest: (call) => {
				expect(call.headers.Accept).toBe("application/vnd.amazon.eventstream");
				expect(call.bodyJson?.anthropic_version).toBe("bedrock-2023-05-31");
			},
			response: () => eventStreamResponse(CLAUDE_STREAM_EVENTS.map(invokeChunkFrame)),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "stream please" }] }],
			}, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			expect(mock.calls).toHaveLength(1);
			if (result.kind !== "stream") throw new Error("expected_stream_result");
			const payloads = parseSseJson(await readSseFrames(new Response(result.stream)));
			expect(payloads.some((payload) => payload?.delta?.text === "runtime streamed")).toBe(true);
			const bill = await result.usageFinalizer?.();
			expect(bill?.usage).toMatchObject({ input_text_tokens: 9, output_text_tokens: 3 });
			expect(bill?.finish_reason).toBe("stop");
		} finally {
			mock.restore();
		}
	});

	it("turns a bedrock-runtime stream exception into an error event", async () => {
		const model = "global.anthropic.claude-sonnet-4-6";
		const exception = encodeEventStreamFrame([
			[":message-type", "exception"],
			[":exception-type", "throttlingException"],
			[":content-type", "application/json"],
		], JSON.stringify({ message: "Too many tokens, please wait before trying again." }));
		const mock = installFetchMock([{
			match: (url) => url.includes("/invoke-with-response-stream"),
			response: () => eventStreamResponse([invokeChunkFrame(CLAUDE_STREAM_EVENTS[0]!), exception]),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "stream please" }] }],
			}, { endpoint: "messages", protocol: "anthropic.messages", providerModelSlug: model }));
			if (result.kind !== "stream") throw new Error("expected_stream_result");
			const text = await new Response(result.stream).text();
			expect(text).toContain("Too many tokens, please wait before trying again.");
		} finally {
			mock.restore();
		}
	});

	it("signs bedrock-runtime requests with the bedrock SigV4 service", async () => {
		// curl example on inference-messages-api.html: --aws-sigv4 "aws:amz:us-east-1:bedrock".
		const model = "global.anthropic.claude-opus-4-6-v1";
		const mock = installFetchMock([{
			match: (url) => url.startsWith("https://bedrock-runtime.us-east-1.amazonaws.com/model/"),
			response: () => jsonResponse({
				id: "msg", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }],
				stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
			}),
		}]);
		try {
			const credentials = JSON.stringify({ accessKeyId: "AKIATEST", secretAccessKey: "secret", region: "us-east-1", baseUrl: "https://bedrock-mantle.us-east-1.api.aws" });
			const result = await execute(buildArgs({
				model,
				stream: false,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			}, {
				providerModelSlug: model,
				byokMeta: [{ id: "byok_aws", key: credentials, providerId: "amazon-bedrock", alwaysUse: true }] as any,
			}));
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.headers.Authorization).toContain("/us-east-1/bedrock/aws4_request");
		} finally {
			mock.restore();
		}
	});

	it("sends inference-profile GPT routes to bedrock-runtime /openai/v1", async () => {
		// GPT-5.6 Sol card: on bedrock-runtime "the base URL is .../openai/v1 and requests
		// must name the geographic cross-Region inference ID"; Mantle has no us-west-2.
		const model = "global.openai.gpt-5.6-sol";
		const mock = installFetchMock([{
			match: (url) => url === "https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1/responses",
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe(model);
				expect(call.headers.Authorization).toBe("Bearer test-bedrock-key");
			},
			response: () => new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);
		try {
			const result = await execute(buildArgs({
				model,
				stream: true,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			}, { endpoint: "responses", protocol: "openai.responses", providerModelSlug: model }));
			expect(result.kind).toBe("stream");
			expect(mock.calls).toHaveLength(1);
		} finally {
			mock.restore();
		}
	});

	it.each([
		{ client: "Chat Completions", endpoint: "chat.completions", protocol: "openai.chat.completions" },
		{ client: "Responses", endpoint: "responses", protocol: "openai.responses" },
	])("sends Claude Sonnet 5 to Mantle Messages for $client clients", async ({ endpoint, protocol }) => {
		// Model card: Claude Sonnet 5 on bedrock-mantle supports Messages only.
		const mock = installFetchMock([{
			match: (url) => url === "https://api.bedrock.example/anthropic/v1/messages",
			onRequest: (call) => {
				expect(call.headers["x-api-key"]).toBe("test-bedrock-key");
				expect(call.headers["anthropic-version"]).toBe("2023-06-01");
				expect(call.bodyJson?.model).toBe("anthropic.claude-sonnet-5");
				expect(call.bodyJson?.system).toEqual([
					{ type: "text", text: "Policy text", cache_control: { type: "ephemeral" } },
				]);
				expect(call.bodyJson?.messages).toEqual([
					{ role: "user", content: [{ type: "text", text: "hello mantle" }] },
				]);
			},
			response: jsonResponse({
				id: "msg_bdrk_01",
				type: "message",
				role: "assistant",
				model: "anthropic.claude-sonnet-5",
				content: [{ type: "text", text: "mantle ok" }],
				stop_reason: "end_turn",
				usage: { input_tokens: 4, cache_creation_input_tokens: 1200, cache_read_input_tokens: 0, output_tokens: 2 },
			}, { headers: { "x-amzn-requestid": "bedrock-mantle-req" } }),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-sonnet-5",
			stream: false,
			maxTokens: 512,
			messages: [
				{ role: "system", content: [{ type: "text", text: "Policy text", cacheControl: { type: "prompt_cache_breakpoint", mode: "explicit" } }] },
				{ role: "user", content: [{ type: "text", text: "hello mantle" }] },
			],
		}, {
			endpoint,
			protocol,
		}));

		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result.ir?.choices?.[0]?.message?.content?.[0] as any)?.text).toBe("mantle ok");
		expect(result.bill.upstream_id).toBe("bedrock-mantle-req");
		expect(result.bill.usage).toMatchObject({ cached_write_text_tokens: 1200 });
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).not.toContain("/openai/v1/");
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

	it("sends Claude JSON Schema Responses requests to Mantle Messages", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/anthropic/v1/messages"),
			onRequest: (call) => {
				expect(call.bodyJson?.output_config?.format?.type).toBe("json_schema");
				expect(call.bodyJson?.stream).toBe(true);
				expect(call.bodyJson?.store).toBeUndefined();
				expect(call.bodyJson?.previous_response_id).toBeUndefined();
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
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}, {
			endpoint: "responses",
			protocol: "openai.responses",
		}));
		mock.restore();
		expect(result.kind).toBe("stream");
		expect(mock.calls[0]?.url).not.toContain("/openai/v1/");
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
				match: (url) => url === "https://api.bedrock.example/v1/responses",
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

		expect(mock.calls[0]?.url).toBe("https://api.bedrock.example/v1/responses");
		expect(mock.calls).toHaveLength(1);
		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(404);
	});

});
