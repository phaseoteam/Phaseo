import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executeOpenAICompat } from "../index";
import { installFetchMock, jsonResponse } from "../../../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../../../tests/helpers/sse";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

function buildArgs(): ExecutorExecuteArgs {
	return {
		ir: {
			model: "deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
			tools: [{
				name: "lookup_weather",
				parameters: { type: "object" },
			}],
		},
		requestId: "req_shared_openai_compat_stream_tools",
		workspaceId: "team_test",
		providerId: "deepinfra",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {
			returnUpstreamRequest: true,
		},
	} as ExecutorExecuteArgs;
}

describe("executeOpenAICompat", () => {
	const ALIBABA_CHAT_URL = "https://api.alibaba.example/compatible-mode/v1/chat/completions";

	it("keeps upstream stream=true when tools are present", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.deepinfra.example/v1/openai/chat/completions",
			response: sseResponse([
				{
					id: "chatcmpl_1",
					object: "chat.completion.chunk",
					model: "deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
				},
				"[DONE]",
			]),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeOpenAICompat(buildArgs());
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(capturedBody?.stream).toBe(true);
		expect(capturedBody?.stream_options?.include_usage).toBe(true);
		expect(Array.isArray(capturedBody?.tools)).toBe(true);
	});

	it("routes alibaba-cloud to chat completions for text models", async () => {
		const args = buildArgs();
		args.providerId = "alibaba-cloud";
		args.endpoint = "responses";
		args.protocol = "openai.responses";
		args.ir = {
			...args.ir,
			model: "qwen2.5-72b-instruct",
			stream: false,
		};

		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === ALIBABA_CHAT_URL,
			response: jsonResponse({
				id: "chatcmpl_1",
				object: "chat.completion",
				created: 1735689600,
				model: "qwen2.5-72b-instruct",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(ALIBABA_CHAT_URL);
		expect(capturedBody?.stream).toBe(true);
	});

	it("reports Meta native web search usage as billable web search requests", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			META_MODEL_API_KEY: "test-meta-key",
		} as any);

		const args = buildArgs();
		args.providerId = "meta";
		args.endpoint = "responses";
		args.protocol = "openai.responses";
		args.providerModelSlug = "muse-spark-1.1";
		args.ir = {
			model: "meta/muse-spark-1.1",
			stream: false,
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Find the latest Meta Model API news." }],
			}],
			webSearchOptions: {
				search_context_size: "high",
			},
		} as any;

		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.llama.com/compat/v1/responses",
			response: sseResponse([{
				response: {
					id: "resp_meta_search",
					object: "response",
					created_at: 1783612800,
					model: "muse-spark-1.1",
					status: "completed",
					output: [{
						type: "message",
						role: "assistant",
						content: [{
							type: "output_text",
							text: "Muse Spark 1.1 is available through the Meta Model API.",
						}],
					}],
					usage: {
						input_tokens: 20,
						output_tokens: 8,
						total_tokens: 28,
						server_tool_use: {
							web_search_requests: 2,
						},
					},
				},
			}]),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		let result!: Awaited<ReturnType<typeof executeOpenAICompat>>;
		try {
			result = await executeOpenAICompat(args);
		} finally {
			mock.restore();
			teardownTestRuntime();
			setupTestRuntime();
		}

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-meta-key");
		expect(capturedBody?.input).toBeDefined();
		expect(capturedBody?.input_items).toBeUndefined();
		expect(capturedBody?.web_search_options).toEqual({
			search_context_size: "high",
		});
		expect(capturedBody?.tools).toEqual([{
			type: "web_search_preview",
			search_context_size: "high",
		}]);
		expect(result.bill.usage).toMatchObject({
			input_text_tokens: 20,
			output_text_tokens: 8,
			native_web_search_requests: 2,
		});
	});

	it("routes Poolside responses-surface continuations through chat completions payloads", async () => {
		const args = buildArgs();
		args.providerId = "poolside";
		args.endpoint = "responses";
		args.protocol = "openai.responses";
		args.providerModelSlug = "laguna-xs-2.1";
		args.ir = {
			...args.ir,
			model: "poolside/laguna-xs-2.1:free",
			stream: false,
			messages: [
				{ role: "user", content: [{ type: "text", text: "What is the time?" }] },
				{
					role: "assistant",
					content: [],
					toolCalls: [{
						id: "call_datetime",
						name: "gateway_datetime",
						arguments: "{}",
					}],
				},
				{
					role: "tool",
					toolResults: [{
						toolCallId: "call_datetime",
						content: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-07-06T15:25:15.298+00:00\"}]}",
					}],
				},
			],
			tools: [{
				name: "gateway_datetime",
				parameters: { type: "object" },
			}],
		};

		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.poolside.example/v1/chat/completions",
			response: jsonResponse({
				id: "chatcmpl_laguna_final",
				object: "chat.completion",
				created: 1778073915,
				model: "laguna-xs-2.1",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "It is 15:25 UTC." },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
			}),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe("https://api.poolside.example/v1/chat/completions");
		expect(capturedBody?.input).toBeUndefined();
		expect(capturedBody?.messages).toEqual([
			{
				role: "user",
				content: "What is the time?",
			},
			{
				role: "assistant",
				content: null,
				tool_calls: [{
					id: "call_datetime",
					type: "function",
					function: {
						name: "gateway_datetime",
						arguments: "{}",
					},
				}],
			},
			{
				role: "tool",
				tool_call_id: "call_datetime",
				content: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-07-06T15:25:15.298+00:00\"}]}",
			},
		]);
		expect(capturedBody?.stream).toBe(true);
		expect(capturedBody?.stream_options?.include_usage).toBe(true);
	});

	it("routes alibaba-cloud omni models to chat completions", async () => {
		const args = buildArgs();
		args.providerId = "alibaba-cloud";
		args.endpoint = "responses";
		args.protocol = "openai.responses";
		args.ir = {
			...args.ir,
			model: "qwen3.5-omni-plus",
			stream: false,
		};

		const mock = installFetchMock([{
			match: (url) => url === ALIBABA_CHAT_URL,
			response: jsonResponse({
				id: "chatcmpl_omni_1",
				object: "chat.completion",
				created: 1735689600,
				model: "qwen3.5-omni-plus",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(ALIBABA_CHAT_URL);
	});

	it("routes alibaba-cloud video input requests to chat completions", async () => {
		const args = buildArgs();
		args.providerId = "alibaba-cloud";
		args.endpoint = "chat.completions";
		args.protocol = "openai.chat.completions";
		args.ir = {
			...args.ir,
			model: "qwen3.6-35b-a3b",
			stream: false,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Describe this video." },
					{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
				],
			}],
		};

		const mock = installFetchMock([{
			match: (url) => url === ALIBABA_CHAT_URL,
			response: jsonResponse({
				id: "chatcmpl_video_1",
				object: "chat.completion",
				created: 1735689600,
				model: "qwen3.6-35b-a3b",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(ALIBABA_CHAT_URL);
	});

	it("retries transient baseten 429 responses once before failing over", async () => {
		const args = buildArgs();
		args.providerId = "baseten";
		args.ir = {
			...args.ir,
			model: "openai/gpt-oss-120b",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.baseten.example/v1/chat/completions",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "rate limited" } },
						{ status: 429, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_baseten_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "openai/gpt-oss-120b",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Api-Key test-baseten-key");
	});

	it("retries transient groq 503 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "groq";
		args.ir = {
			...args.ir,
			model: "llama-3.3-70b-versatile",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.groq.example/openai/v1/responses",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "upstream unavailable" } },
						{ status: 503, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_groq_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "llama-3.3-70b-versatile",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-groq-key");
	});

	it("retries transient fireworks 429 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "fireworks";
		args.ir = {
			...args.ir,
			model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.fireworks.example/inference/v1/responses",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "rate limited" } },
						{ status: 429, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_fireworks_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-fireworks-key");
	});

	it("retries transient weights-and-biases 503 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "weights-and-biases";
		args.ir = {
			...args.ir,
			model: "openai/gpt-oss-120b",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.wandb.example/v1/chat/completions",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "upstream unavailable" } },
						{ status: 503, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_wandb_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "openai/gpt-oss-120b",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-wandb-key");
	});

	it("retries transient venice 429 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "venice";
		args.ir = {
			...args.ir,
			model: "venice-uncensored",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.venice.example/api/v1/responses",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "rate limited" } },
						{ status: 429, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_venice_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "venice-uncensored",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-venice-key");
	});

	it("retries transient akashml 503 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "akashml";
		args.ir = {
			...args.ir,
			model: "DeepSeek-V3.2",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.akashml.example/v1/chat/completions",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "upstream unavailable" } },
						{ status: 503, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_akashml_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "DeepSeek-V3.2",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-akashml-key");
	});

	it("retries transient ionrouter 429 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "ionrouter";
		args.ir = {
			...args.ir,
			model: "qwen3.5-122b-a10b",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.ionrouter.example/v1/chat/completions",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "rate limited" } },
						{ status: 429, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_ionrouter_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "qwen3.5-122b-a10b",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-ionrouter-key");
	});

	it("retries transient gmicloud 503 responses once before succeeding", async () => {
		const args = buildArgs();
		args.providerId = "gmicloud";
		args.ir = {
			...args.ir,
			model: "Qwen/Qwen3-235B-A22B-Thinking-2507",
			stream: false,
		};

		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.gmi-serving.com/v1/chat/completions",
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "upstream unavailable" } },
						{ status: 503, headers: { "retry-after": "0" } },
					);
				}
				return jsonResponse({
					id: "chatcmpl_gmicloud_retry",
					object: "chat.completion",
					created: 1735689600,
					model: "Qwen/Qwen3-235B-A22B-Thinking-2507",
					choices: [{
						index: 0,
						message: { role: "assistant", content: "ok" },
						finish_reason: "stop",
					}],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			},
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-gmi-key");
	});
});

