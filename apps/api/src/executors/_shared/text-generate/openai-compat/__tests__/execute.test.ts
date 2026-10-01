import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executeOpenAIWire } from "../index";
import { execute as executeNovita } from "@executors/novitaai/text-generate";
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

function executeProviderWire(args: ExecutorExecuteArgs) {
	if (args.providerId === "alibaba-cloud") {
		return executeOpenAIWire(args, {
			forceChat: true,
		});
	}
	if (
		[
			"baseten",
			"groq",
			"fireworks",
			"weights-and-biases",
			"venice",
			"akashml",
			"ionrouter",
			"gmicloud",
		].includes(args.providerId)
	) {
		return executeOpenAIWire(args, { transientRetries: 1 });
	}
	return executeOpenAIWire(args);
}

describe("executeOpenAIWire", () => {
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

		const result = await executeProviderWire(buildArgs());
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(capturedBody?.stream).toBe(true);
		expect(capturedBody?.stream_options?.include_usage).toBe(true);
		expect(Array.isArray(capturedBody?.tools)).toBe(true);
	});

	it("routes private models only to their request-scoped endpoint", async () => {
		const args = buildArgs();
		args.providerId = "private-model";
		args.providerModelSlug = "legal-v4";
		args.privateEndpoint = { baseUrl: "https://models.customer.example/openai/v1", supportsResponses: false };
		args.byokMeta = [{
			id: "private-model-id",
			providerId: "private-model",
			fingerprintSha256: "fingerprint",
			keyVersion: "1",
			alwaysUse: true,
			key: "private-endpoint-secret",
		}];
		let capturedHeaders: Record<string, string> = {};
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://models.customer.example/openai/v1/chat/completions",
			response: sseResponse([{
				id: "chatcmpl_private",
				object: "chat.completion.chunk",
				model: "legal-v4",
				choices: [{ index: 0, delta: { content: "private response" }, finish_reason: null }],
			}, "[DONE]"]),
			onRequest: (call) => {
				capturedHeaders = call.headers;
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeOpenAIWire(args, { forceChat: true });
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(capturedHeaders.Authorization).toBe("Bearer private-endpoint-secret");
		expect(capturedBody.model).toBe("legal-v4");
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

		const result = await executeProviderWire(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(ALIBABA_CHAT_URL);
		expect(capturedBody?.stream).toBe(true);
	});

	it("keeps Novita upstream streaming and accepts clean empty completion streams", async () => {
		const args = buildArgs();
		args.providerId = "novita";
		args.providerModelSlug = "mindai/macaron-v1-tall";
		args.ir = {
			...args.ir,
			model: "mindai/macaron-v1-tall",
			stream: false,
		};

		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.novita.example/openai/v1/chat/completions",
			response: sseResponse(["[DONE]"]),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeNovita(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.stream).toBe(true);
		expect(capturedBody?.stream_options?.include_usage).toBe(true);
		if (result.kind !== "completed") throw new Error("Expected completed result");
		expect(result.ir?.choices[0]?.finishReason).toBe("length");
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
			previousResponseId: "resp_previous_meta",
			reasoning: {
				effort: "high",
			},
			webSearchOptions: {
				search_context_size: "high",
			},
		} as any;

		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.meta.ai/v1/responses",
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
						prompt_tokens: 20,
						completion_tokens: 12,
						total_tokens: 28,
						completion_tokens_details: {
							reasoning_tokens: 4,
						},
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

		let result!: Awaited<ReturnType<typeof executeProviderWire>>;
		try {
			result = await executeProviderWire(args);
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
		expect(capturedBody?.previous_response_id).toBe("resp_previous_meta");
		expect(capturedBody?.reasoning_effort).toBe("high");
		expect(capturedBody?.reasoning).toBeUndefined();
		expect(capturedBody?.tools).toEqual([{
			type: "web_search_preview",
			search_context_size: "high",
		}]);
		expect(result.bill.usage).toMatchObject({
			input_text_tokens: 20,
			output_text_tokens: 12,
			reasoning_tokens: 4,
			native_web_search_requests: 2,
		});
	});

	it("routes Poolside responses-surface continuations through chat completions payloads", async () => {
		const args = buildArgs();
		args.providerId = "poolside";
		args.endpoint = "responses";
		args.protocol = "openai.responses";
		args.providerModelSlug = null;
		args.ir = {
			...args.ir,
			model: "poolside/laguna-s-2.1:free",
			stream: false,
			reasoning: { enabled: false },
			maxTokens: 4096,
			temperature: 0.2,
			topK: 20,
			minP: 0,
			parallelToolCalls: false,
			messages: [
				{ role: "user", content: [{ type: "text", text: "What is the time?" }] },
				{
					role: "assistant",
					content: [{ type: "reasoning_text", text: "Need the current time." }],
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
				model: "poolside/laguna-s-2.1",
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						reasoning_content: "The tool result is in UTC.",
						content: "It is 15:25 UTC.",
					},
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
			}),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeProviderWire(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe("https://api.poolside.example/v1/chat/completions");
		expect(capturedBody?.input).toBeUndefined();
		expect(capturedBody?.model).toBe("poolside/laguna-s-2.1");
		expect(capturedBody?.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(capturedBody).toMatchObject({
			max_tokens: 4096,
			temperature: 0.2,
			top_k: 20,
			min_p: 0,
			parallel_tool_calls: false,
		});
		expect(capturedBody?.messages).toEqual([
			{
				role: "user",
				content: "What is the time?",
			},
			{
				role: "assistant",
				content: null,
				reasoning_content: "Need the current time.",
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
		expect(result.kind === "completed" ? result.ir?.choices[0]?.message.content : []).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "reasoning_text", text: "The tool result is in UTC." }),
			]),
		);
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

		const result = await executeProviderWire(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(ALIBABA_CHAT_URL);
	});

	it("sends Reka multimodal Chat requests with native auth and normalizes usage", async () => {
		const args = buildArgs();
		args.providerId = "reka";
		args.ir = {
			model: "reka-flash",
			stream: false,
			messages: [{
				role: "user",
				content: [
					{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
					{ type: "audio", source: "url", data: "https://example.com/audio.mp3", format: "mp3" },
					{ type: "text", text: "Summarize both." },
				],
			}],
			tools: [{ name: "save_summary", parameters: { type: "object" } }],
			toolChoice: "required",
		};

		let capturedBody: any;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.reka.ai/v1/chat/completions",
			response: jsonResponse({
				id: "reka_1",
				model: "reka-flash",
				choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Done" } }],
				usage: { input_tokens: 14, output_tokens: 3 },
			}),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await executeProviderWire(args);
		mock.restore();

		expect(mock.calls[0]?.headers["X-Api-Key"]).toBe("test-reka-key");
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-reka-key");
		expect(capturedBody.tool_choice).toBe("tool");
		expect(capturedBody.messages[0].content).toEqual([
			{ type: "video_url", video_url: "https://example.com/clip.mp4" },
			{ type: "audio_url", audio_url: "https://example.com/audio.mp3" },
			{ type: "text", text: "Summarize both." },
		]);
		expect(result.kind === "completed" ? result.bill.usage : null).toMatchObject({
			input_text_tokens: 14,
			output_text_tokens: 3,
		});
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-baseten-key");
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
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

		const result = await executeProviderWire(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(callCount).toBe(2);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-gmi-key");
	});
});
