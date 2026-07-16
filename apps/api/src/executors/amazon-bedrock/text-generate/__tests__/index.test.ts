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

	it("routes OpenAI Bedrock models to /openai/v1/chat/completions", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/chat/completions"),
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe("openai.gpt-oss-20b-1:0");
				expect(call.bodyJson?.messages?.[0]?.role).toBe("user");
				expect(call.bodyJson?.stream).toBe(false);
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

	it("routes all Bedrock models to the unified OpenAI-compatible endpoint", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.bedrock.example/openai/v1/chat/completions",
			onRequest: (call) => {
				expect(call.bodyJson?.model).toBe("anthropic.claude-sonnet-5-v1:0");
				expect(call.bodyJson?.messages?.[0]?.role).toBe("user");
				expect(call.bodyJson?.stream).toBe(false);
			},
			response: jsonResponse({
				id: "chatcmpl_bedrock_mantle",
				object: "chat.completion",
				created: 1710000000,
				model: "anthropic.claude-sonnet-5-v1:0",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "mantle ok" },
					finish_reason: "stop",
				}],
				usage: {
					prompt_tokens: 4,
					completion_tokens: 2,
					total_tokens: 6,
				},
			}, {
				headers: {
					"x-amzn-requestid": "bedrock-mantle-req",
				},
			}),
		}]);

		const result = await execute(buildArgs({
			model: "anthropic.claude-sonnet-5-v1:0",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello mantle" }] }],
		}, {
			providerId: "amazon-bedrock",
			pricingCard: {
				provider: "amazon-bedrock",
				model: "anthropic.claude-sonnet-5-v1:0",
				endpoint: "chat.completions",
				effective_from: null,
				effective_to: null,
				currency: "USD",
				version: null,
				rules: [],
			},
		}));

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]?.type).toBe("text");
	});

	it("uses Responses for GPT-5.6 models even on the chat surface", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/openai/v1/responses"),
			response: new Response(new ReadableStream<Uint8Array>(), { status: 200 }),
		}]);

		const result = await execute(buildArgs({
			model: "openai.gpt-5.6-sol",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}));

		mock.restore();
		expect(result.kind).toBe("stream");
		expect(mock.calls[0]?.url.endsWith("/openai/v1/responses")).toBe(true);
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
		expect(result.upstreamAttempts).toHaveLength(2);
		expect(result.upstreamAttempts?.map((attempt) => ({
			route: attempt.route,
			status: attempt.status,
			outcome: attempt.outcome,
		}))).toEqual([
			{ route: "responses", status: 404, outcome: "upstream_non_2xx" },
			{ route: "chat", status: 200, outcome: "success" },
		]);
	});

});
