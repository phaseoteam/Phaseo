import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { runTextGeneratePipeline } from "./text-generate";

const detectTextProtocolMock = vi.fn();
const decodeProtocolMock = vi.fn();
const encodeProtocolMock = vi.fn();
const doRequestWithIRMock = vi.fn();
const finalizeRequestMock = vi.fn();
const validateTextIRContractMock = vi.fn();
const prepareServerToolsForTextRequestMock = vi.fn();
const consumeTextProtocolStreamToIRMock = vi.fn();
const buildServerToolContinuationMock = vi.fn();
const mergeIRUsageTotalsMock = vi.fn();
const attachServerToolUsageMock = vi.fn();
const attachServerToolUsageToRawUsageMock = vi.fn();
const buildSyntheticServerToolStreamMock = vi.fn();
const getResponseCacheMock = vi.fn();

vi.mock("@protocols/detect", () => ({
	detectTextProtocol: (...args: any[]) => detectTextProtocolMock(...args),
}));

vi.mock("@protocols/index", () => ({
	decodeProtocol: (...args: any[]) => decodeProtocolMock(...args),
	encodeProtocol: (...args: any[]) => encodeProtocolMock(...args),
}));

vi.mock("../execute", () => ({
	doRequestWithIR: (...args: any[]) => doRequestWithIRMock(...args),
}));

vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => finalizeRequestMock(...args),
}));

vi.mock("../text-ir-contract", () => ({
	validateTextIRContract: (...args: any[]) =>
		validateTextIRContractMock(...args),
	buildTextIRContractErrorResponse: () =>
		new Response(JSON.stringify({ error: "invalid_contract" }), {
			status: 400,
		}),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: (...args: any[]) => getResponseCacheMock(...args),
	ensureRuntimeForBackground: vi.fn(),
	dispatchBackground: vi.fn(),
}));

vi.mock("./server-tools", () => ({
	prepareServerToolsForTextRequest: (...args: any[]) =>
		prepareServerToolsForTextRequestMock(...args),
	consumeTextProtocolStreamToIR: (...args: any[]) =>
		consumeTextProtocolStreamToIRMock(...args),
	buildServerToolContinuation: (...args: any[]) =>
		buildServerToolContinuationMock(...args),
	mergeIRUsageTotals: (...args: any[]) => mergeIRUsageTotalsMock(...args),
	attachServerToolUsage: (...args: any[]) =>
		attachServerToolUsageMock(...args),
	attachServerToolUsageToRawUsage: (...args: any[]) =>
		attachServerToolUsageToRawUsageMock(...args),
	buildSyntheticServerToolStream: (...args: any[]) =>
		buildSyntheticServerToolStreamMock(...args),
}));

function createPre() {
	return {
		ok: true as const,
		ctx: {
			endpoint: "chat_completions",
			capability: "text.generate",
			requestId: "req_server_tools",
			protocol: "openai.chat.completions",
			meta: {
				debug: undefined,
				returnMeta: false,
				before_ms: 8,
			},
			rawBody: {
				model: "openai/gpt-5.4-nano",
				messages: [{ role: "user", content: "What time is it?" }],
				tools: [{ type: "gateway:datetime", parameters: { timezones: ["UTC"] } }],
				tool_choice: "gateway:datetime",
			},
			body: {
				model: "openai/gpt-5.4-nano",
				messages: [{ role: "user", content: "What time is it?" }],
				tools: [{ type: "gateway:datetime", parameters: { timezones: ["UTC"] } }],
				tool_choice: "gateway:datetime",
			},
			model: "openai/gpt-5.4-nano",
			workspaceId: "ws_123",
			stream: false,
			providers: [],
			pricing: {},
			gating: {
				key: { ok: true, reason: null, resetAt: null },
				keyLimit: { ok: true, reason: null, resetAt: null },
				credit: { ok: true, reason: null, resetAt: null },
			},
			preset: null,
			internal: false,
			teamSettings: {
				routingMode: "balanced",
				byokFallbackEnabled: true,
				betaChannelEnabled: false,
				billingMode: "wallet",
			},
			routingMode: "balanced",
		} as any,
	};
}

function createArgs(args?: { stream?: boolean }) {
	const pre = createPre();
	if (args?.stream) {
		pre.ctx.stream = true;
		pre.ctx.body.stream = true;
		pre.ctx.rawBody.stream = true;
	}
	return {
		pre,
		req: new Request("https://example.com/v1/chat/completions", {
			method: "POST",
		}),
		endpoint: "chat_completions" as const,
		timing: {
			timer: new Timer(),
			internal: {
				adapterMarked: false,
			},
		},
	};
}

function createEmptyStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close();
		},
	});
}

describe("runTextGeneratePipeline server tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		detectTextProtocolMock.mockReturnValue("openai.chat.completions");
		decodeProtocolMock.mockImplementation((_protocol: string, body: any) => ({
			stream: body?.stream === true,
			messages: [{ role: "user", content: "What time is it?" }],
		}));
		validateTextIRContractMock.mockReturnValue([]);
		prepareServerToolsForTextRequestMock.mockImplementation((body: any) => ({
			ok: true,
			body,
			config: {
				enabled: true,
				datetimeDefaultTimezones: ["UTC"],
				webSearchEnabled: false,
				webSearchMaxResults: 5,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: 12000,
			},
		}));
		getResponseCacheMock.mockReturnValue(null);
	});

	it("executes the datetime follow-up loop and records tool usage on non-stream requests", async () => {
		const initialUsage = { inputTokens: 10, outputTokens: 2, totalTokens: 12 };
		const finalUsage = { inputTokens: 6, outputTokens: 5, totalTokens: 11 };
		const mergedUsage = { inputTokens: 16, outputTokens: 7, totalTokens: 23 };
		const usageWithServerTool = {
			...mergedUsage,
			_ext: { serverToolUse: { datetime_requests: 1 } },
		};
		const billUsageWithServerTool = {
			prompt_tokens: 16,
			completion_tokens: 7,
			total_tokens: 23,
			server_tool_use: { datetime_requests: 1 },
		};
		const rawResponseUsageWithServerTool = {
			input_tokens: 16,
			output_tokens: 7,
			total_tokens: 23,
			server_tool_use: { datetime_requests: 1 },
		};

		consumeTextProtocolStreamToIRMock.mockResolvedValue({
			ir: {
				id: "ir_tool_call",
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_datetime",
									name: "gateway_datetime",
									arguments: "{\"timezones\":[\"UTC\"]}",
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
				usage: initialUsage,
			},
			rawResponse: {
				id: "raw_tool_call",
				usage: {
					input_tokens: 10,
					output_tokens: 2,
					total_tokens: 12,
				},
			},
			usageRaw: {
				input_tokens: 10,
				output_tokens: 2,
				total_tokens: 12,
			},
		});

		buildServerToolContinuationMock
			.mockResolvedValueOnce({
				assistantMessage: {
					role: "assistant",
					content: [],
					toolCalls: [
						{
							id: "call_datetime",
							name: "gateway_datetime",
							arguments: "{\"timezones\":[\"UTC\"]}",
						},
					],
				},
				toolResults: [
					{
						toolCallId: "call_datetime",
						content: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-05-09T12:00:00.000+00:00\"}]}",
					},
				],
				usage: {
					datetimeRequests: 1,
					webSearchRequests: 0,
					webSearchResults: 0,
					webSearchExtraResults: 0,
					webFetchRequests: 0,
					advisorRequests: 0,
					imageGenerationRequests: 0,
					applyPatchRequests: 0,
				},
			})
			.mockResolvedValueOnce(null);

		mergeIRUsageTotalsMock.mockReturnValue(mergedUsage);
		attachServerToolUsageMock.mockReturnValue(usageWithServerTool);
		attachServerToolUsageToRawUsageMock
			.mockReturnValueOnce(billUsageWithServerTool)
			.mockReturnValueOnce(rawResponseUsageWithServerTool);

		doRequestWithIRMock
			.mockResolvedValueOnce({
				result: {
					kind: "stream",
					stream: createEmptyStream(),
					upstream: new Response(null, { status: 200 }),
					provider: "openai",
					generationTimeMs: 2,
					bill: {
						cost_cents: 0,
						currency: "USD",
						usage: {
							prompt_tokens: 10,
							completion_tokens: 2,
							total_tokens: 12,
						},
					},
					rawResponse: null,
				},
			})
			.mockResolvedValueOnce({
				result: {
					kind: "completed",
					ir: {
						id: "ir_final",
						choices: [
							{
								message: {
									role: "assistant",
									content: [{ type: "text", text: "Current UTC time is 2026-05-09T12:00:00Z." }],
								},
								finishReason: "stop",
							},
						],
						usage: finalUsage,
					},
					upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
					provider: "openai",
					generationTimeMs: 4,
					bill: {
						cost_cents: 0,
						currency: "USD",
						usage: {
							prompt_tokens: 6,
							completion_tokens: 5,
							total_tokens: 11,
						},
					},
					rawResponse: {
						id: "resp_final",
						usage: {
							input_tokens: 6,
							output_tokens: 5,
							total_tokens: 11,
						},
					},
				},
			});

		encodeProtocolMock.mockReturnValue({
			id: "chatcmpl_final",
			choices: [{ message: { role: "assistant", content: "Current UTC time is 2026-05-09T12:00:00Z." } }],
		});
		finalizeRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const args = createArgs();
		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(2);
		expect(consumeTextProtocolStreamToIRMock).toHaveBeenCalledTimes(1);
		expect(buildServerToolContinuationMock).toHaveBeenCalledTimes(2);
		expect(mergeIRUsageTotalsMock).toHaveBeenCalledWith(initialUsage, finalUsage);
		expect(attachServerToolUsageMock).toHaveBeenCalledWith(mergedUsage, {
			datetimeRequests: 1,
			webSearchRequests: 0,
			webSearchResults: 0,
			webSearchExtraResults: 0,
			webFetchRequests: 0,
			advisorRequests: 0,
			imageGenerationRequests: 0,
			applyPatchRequests: 0,
		});
		expect(attachServerToolUsageToRawUsageMock).toHaveBeenNthCalledWith(
			1,
			{
				prompt_tokens: 6,
				completion_tokens: 5,
				total_tokens: 11,
			},
			{
				datetimeRequests: 1,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			},
		);
		expect(attachServerToolUsageToRawUsageMock).toHaveBeenNthCalledWith(
			2,
			{
				input_tokens: 6,
				output_tokens: 5,
				total_tokens: 11,
			},
			{
				datetimeRequests: 1,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			},
		);

		const followUpRequest = doRequestWithIRMock.mock.calls[1]?.[1];
		expect(followUpRequest.toolChoice).toBe("auto");
		expect(followUpRequest.messages).toHaveLength(3);
		expect(followUpRequest.messages[1]).toMatchObject({
			role: "assistant",
			toolCalls: [{ id: "call_datetime", name: "gateway_datetime" }],
		});
		expect(followUpRequest.messages[2]).toMatchObject({
			role: "tool",
			toolResults: [{ toolCallId: "call_datetime" }],
		});

		const finalizeArgs = finalizeRequestMock.mock.calls[0]?.[0];
		expect(finalizeArgs.pre.ctx.providerRounds).toEqual([
			expect.objectContaining({
				round_number: 1,
				provider: "openai",
				finish_reason: "tool_calls",
				usage: {
					prompt_tokens: 10,
					completion_tokens: 2,
					total_tokens: 12,
				},
			}),
			expect.objectContaining({
				round_number: 2,
				provider: "openai",
				finish_reason: "stop",
				usage: {
					prompt_tokens: 6,
					completion_tokens: 5,
					total_tokens: 11,
				},
			}),
		]);
		expect(finalizeArgs.exec.result.ir.usage).toEqual(usageWithServerTool);
		expect(finalizeArgs.exec.result.bill.usage).toEqual(billUsageWithServerTool);
		expect(finalizeArgs.exec.result.rawResponse.usage).toEqual(
			rawResponseUsageWithServerTool,
		);
	});

	it("re-emits a synthetic stream after datetime execution for streaming requests", async () => {
		const syntheticStream = createEmptyStream();

		consumeTextProtocolStreamToIRMock.mockResolvedValue({
			ir: {
				id: "ir_tool_call_stream",
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_datetime",
									name: "gateway_datetime",
									arguments: "{\"timezones\":[\"UTC\"]}",
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
				usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
			},
			rawResponse: { id: "raw_stream_tool_call" },
			usageRaw: null,
		});

		buildServerToolContinuationMock
			.mockResolvedValueOnce({
				assistantMessage: {
					role: "assistant",
					content: [],
					toolCalls: [
						{
							id: "call_datetime",
							name: "gateway_datetime",
							arguments: "{\"timezones\":[\"UTC\"]}",
						},
					],
				},
				toolResults: [
					{
						toolCallId: "call_datetime",
						content: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-05-09T12:00:00.000+00:00\"}]}",
					},
				],
				usage: {
					datetimeRequests: 1,
					webSearchRequests: 0,
					webSearchResults: 0,
					webSearchExtraResults: 0,
					webFetchRequests: 0,
					advisorRequests: 0,
					imageGenerationRequests: 0,
					applyPatchRequests: 0,
				},
			})
			.mockResolvedValueOnce(null);

		mergeIRUsageTotalsMock.mockReturnValue({
			inputTokens: 10,
			outputTokens: 6,
			totalTokens: 16,
		});
		attachServerToolUsageMock.mockReturnValue({
			inputTokens: 10,
			outputTokens: 6,
			totalTokens: 16,
			_ext: { serverToolUse: { datetime_requests: 1 } },
		});
		attachServerToolUsageToRawUsageMock.mockImplementation((usage: any) => usage);

		doRequestWithIRMock
			.mockResolvedValueOnce({
				result: {
					kind: "stream",
					stream: createEmptyStream(),
					upstream: new Response(null, { status: 200 }),
					provider: "openai",
					generationTimeMs: 1,
					timing: { generationMs: 11 },
					bill: { cost_cents: 0, currency: "USD", usage: {} },
					rawResponse: null,
				},
			})
			.mockResolvedValueOnce({
				result: {
					kind: "completed",
					ir: {
						id: "ir_final_stream",
						model: "openai/gpt-5.4-nano-2026-03-17",
						choices: [
							{
								message: {
									role: "assistant",
									content: [{ type: "text", text: "Current UTC time is 2026-05-09T12:00:00Z." }],
								},
								finishReason: "stop",
							},
						],
						usage: { inputTokens: 6, outputTokens: 5, totalTokens: 11 },
					},
					upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
					provider: "openai",
					generationTimeMs: 3,
					timing: { generationMs: 17 },
					bill: { cost_cents: 0, currency: "USD", usage: {} },
					rawResponse: {
						id: "chatcmpl_final_stream",
						created: 1778073808,
						model: "openai/gpt-5.4-nano-2026-03-17",
					},
				},
			});

		encodeProtocolMock.mockReturnValue({
			id: "chatcmpl_final_stream",
			created: 1778073808,
			model: "openai/gpt-5.4-nano-2026-03-17",
			choices: [{ message: { role: "assistant", content: "Current UTC time is 2026-05-09T12:00:00Z." } }],
		});
		buildSyntheticServerToolStreamMock.mockReturnValue(syntheticStream);
		finalizeRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const args = createArgs({ stream: true });
		args.pre.ctx.meta.upstreamStartMs = Date.now() - 100;
		args.pre.ctx.meta.startedAtMs = Date.now() - 1_000;
		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(buildSyntheticServerToolStreamMock).toHaveBeenCalledWith({
			protocol: "openai.chat.completions",
			payload: {
				id: "chatcmpl_final_stream",
				created: 1778073808,
				model: "openai/gpt-5.4-nano-2026-03-17",
				choices: [{ message: { role: "assistant", content: "Current UTC time is 2026-05-09T12:00:00Z." } }],
			},
			requestId: "req_server_tools",
			model: "openai/gpt-5.4-nano-2026-03-17",
			created: 1778073808,
			serverToolTrace: [{
				id: "call_datetime",
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
				output: "{\"timezones\":[{\"timezone\":\"UTC\",\"datetime\":\"2026-05-09T12:00:00.000+00:00\"}]}",
			}],
		});

		const finalizeArgs = finalizeRequestMock.mock.calls[0]?.[0];
		expect(finalizeArgs.exec.result.kind).toBe("stream");
		expect(finalizeArgs.exec.result.stream).toBe(syntheticStream);
		expect(finalizeArgs.exec.result.upstream.status).toBe(200);
		expect(finalizeArgs.exec.result.upstream.headers.get("Content-Type")).toBe(
			"text/event-stream",
		);
		expect(finalizeArgs.pre.ctx.meta.generation_ms).toBe(17);
		expect(finalizeArgs.pre.ctx.meta.provider_generation_total_ms).toBe(28);
		expect(finalizeArgs.pre.ctx.meta.provider_call_count).toBe(2);
		expect(finalizeArgs.pre.ctx.meta.throughput_tps).toBeCloseTo(5 / 0.017);
		expect(finalizeArgs.pre.ctx.meta.end_to_end_ms).toBeGreaterThanOrEqual(900);
		expect(finalizeArgs.pre.ctx.meta.latency_ms).toBeGreaterThanOrEqual(883);
		expect(finalizeArgs.pre.ctx.meta.preserve_stream_timing).toBe(true);
	});

	it("executes the managed web search follow-up loop and records search result usage on non-stream requests", async () => {
		const initialUsage = { inputTokens: 8, outputTokens: 3, totalTokens: 11 };
		const finalUsage = { inputTokens: 7, outputTokens: 9, totalTokens: 16 };
		const mergedUsage = { inputTokens: 15, outputTokens: 12, totalTokens: 27 };
		const usageWithServerTool = {
			...mergedUsage,
			_ext: { serverToolUse: { web_search_requests: 1, web_search_results: 2, web_search_extra_results: 0 } },
		};
		const billUsageWithServerTool = {
			prompt_tokens: 15,
			completion_tokens: 12,
			total_tokens: 27,
			server_tool_use: { web_search_requests: 1, web_search_results: 2, web_search_extra_results: 0 },
		};
		const rawResponseUsageWithServerTool = {
			input_tokens: 15,
			output_tokens: 12,
			total_tokens: 27,
			server_tool_use: { web_search_requests: 1, web_search_results: 2, web_search_extra_results: 0 },
		};

		consumeTextProtocolStreamToIRMock.mockResolvedValue({
			ir: {
				id: "ir_tool_call_search",
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_web_search",
									name: "phaseo_web_search",
									arguments:
										'{"query":"latest gateway reliability patterns","max_results":2,"include_text":true}',
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
				usage: initialUsage,
			},
			rawResponse: {
				id: "raw_tool_call_search",
				usage: {
					input_tokens: 8,
					output_tokens: 3,
					total_tokens: 11,
				},
			},
			usageRaw: {
				input_tokens: 8,
				output_tokens: 3,
				total_tokens: 11,
			},
		});

		buildServerToolContinuationMock
			.mockResolvedValueOnce({
				assistantMessage: {
					role: "assistant",
					content: [],
					toolCalls: [
						{
							id: "call_web_search",
							name: "phaseo_web_search",
							arguments:
								'{"query":"latest gateway reliability patterns","max_results":2,"include_text":true}',
						},
					],
				},
				toolResults: [
					{
						toolCallId: "call_web_search",
						content: JSON.stringify({
							provider: "exa",
							query: "latest gateway reliability patterns",
							results: [
								{
									title: "Result A",
									url: "https://example.com/a",
									highlights: ["Fresh grounding detail"],
									text: "Result A body",
								},
								{
									title: "Result B",
									url: "https://example.com/b",
									highlights: [],
									text: "Result B body",
								},
							],
						}),
					},
				],
				usage: {
					datetimeRequests: 0,
					webSearchRequests: 1,
					webSearchResults: 2,
					webSearchExtraResults: 0,
					webFetchRequests: 0,
					advisorRequests: 0,
					imageGenerationRequests: 0,
					applyPatchRequests: 0,
				},
			})
			.mockResolvedValueOnce(null);

		mergeIRUsageTotalsMock.mockReturnValue(mergedUsage);
		attachServerToolUsageMock.mockReturnValue(usageWithServerTool);
		attachServerToolUsageToRawUsageMock
			.mockReturnValueOnce(billUsageWithServerTool)
			.mockReturnValueOnce(rawResponseUsageWithServerTool);

		doRequestWithIRMock
			.mockResolvedValueOnce({
				result: {
					kind: "stream",
					stream: createEmptyStream(),
					upstream: new Response(null, { status: 200 }),
					provider: "openai",
					generationTimeMs: 2,
					bill: {
						cost_cents: 0,
						currency: "USD",
						usage: {
							prompt_tokens: 8,
							completion_tokens: 3,
							total_tokens: 11,
						},
					},
					rawResponse: null,
				},
			})
			.mockResolvedValueOnce({
				result: {
					kind: "completed",
					ir: {
						id: "ir_final_search",
						choices: [
							{
								message: {
									role: "assistant",
									content: [
										{
											type: "text",
											text: "Here are the latest gateway reliability patterns with grounded citations.",
										},
									],
								},
								finishReason: "stop",
							},
						],
						usage: finalUsage,
					},
					upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
					provider: "openai",
					generationTimeMs: 4,
					bill: {
						cost_cents: 0,
						currency: "USD",
						usage: {
							prompt_tokens: 7,
							completion_tokens: 9,
							total_tokens: 16,
						},
					},
					rawResponse: {
						id: "resp_final_search",
						usage: {
							input_tokens: 7,
							output_tokens: 9,
							total_tokens: 16,
						},
					},
				},
			});

		encodeProtocolMock.mockReturnValue({
			id: "chatcmpl_final_search",
			choices: [
				{
					message: {
						role: "assistant",
						content: "Here are the latest gateway reliability patterns with grounded citations.",
					},
				},
			],
		});
		finalizeRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const args = createArgs();
		args.pre.ctx.body.tools = [
			{
				type: "phaseo:web_search",
				parameters: { max_results: 2, include_text: true },
			},
		];
		args.pre.ctx.rawBody.tools = [
			{
				type: "phaseo:web_search",
				parameters: { max_results: 2, include_text: true },
			},
		];
		args.pre.ctx.body.tool_choice = "phaseo:web_search";
		args.pre.ctx.rawBody.tool_choice = "phaseo:web_search";

		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(2);
		expect(consumeTextProtocolStreamToIRMock).toHaveBeenCalledTimes(1);
		expect(buildServerToolContinuationMock).toHaveBeenCalledTimes(2);
		expect(mergeIRUsageTotalsMock).toHaveBeenCalledWith(initialUsage, finalUsage);
		expect(attachServerToolUsageMock).toHaveBeenCalledWith(mergedUsage, {
			datetimeRequests: 0,
			webSearchRequests: 1,
			webSearchResults: 2,
			webSearchExtraResults: 0,
			webFetchRequests: 0,
			advisorRequests: 0,
			imageGenerationRequests: 0,
			applyPatchRequests: 0,
		});
		expect(attachServerToolUsageToRawUsageMock).toHaveBeenNthCalledWith(
			1,
			{
				prompt_tokens: 7,
				completion_tokens: 9,
				total_tokens: 16,
			},
			{
				datetimeRequests: 0,
				webSearchRequests: 1,
				webSearchResults: 2,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			},
		);
		expect(attachServerToolUsageToRawUsageMock).toHaveBeenNthCalledWith(
			2,
			{
				input_tokens: 7,
				output_tokens: 9,
				total_tokens: 16,
			},
			{
				datetimeRequests: 0,
				webSearchRequests: 1,
				webSearchResults: 2,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			},
		);

		const followUpRequest = doRequestWithIRMock.mock.calls[1]?.[1];
		expect(followUpRequest.toolChoice).toBe("auto");
		expect(followUpRequest.messages).toHaveLength(3);
		expect(followUpRequest.messages[1]).toMatchObject({
			role: "assistant",
			toolCalls: [{ id: "call_web_search", name: "phaseo_web_search" }],
		});
		expect(followUpRequest.messages[2]).toMatchObject({
			role: "tool",
			toolResults: [{ toolCallId: "call_web_search" }],
		});

		const finalizeArgs = finalizeRequestMock.mock.calls[0]?.[0];
		expect(finalizeArgs.exec.result.ir.usage).toEqual(usageWithServerTool);
		expect(finalizeArgs.exec.result.bill.usage).toEqual(billUsageWithServerTool);
		expect(finalizeArgs.exec.result.rawResponse.usage).toEqual(
			rawResponseUsageWithServerTool,
		);
	});

	it("re-emits a synthetic stream after managed web fetch execution for streaming requests", async () => {
		const syntheticStream = createEmptyStream();

		consumeTextProtocolStreamToIRMock.mockResolvedValue({
			ir: {
				id: "ir_tool_call_fetch_stream",
				choices: [
					{
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_web_fetch",
									name: "phaseo_web_fetch",
									arguments:
										'{"url":"https://example.com/spec","max_chars":4000}',
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
				usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
			},
			rawResponse: { id: "raw_stream_tool_fetch" },
			usageRaw: null,
		});

		buildServerToolContinuationMock
			.mockResolvedValueOnce({
				assistantMessage: {
					role: "assistant",
					content: [],
					toolCalls: [
						{
							id: "call_web_fetch",
							name: "phaseo_web_fetch",
							arguments:
								'{"url":"https://example.com/spec","max_chars":4000}',
						},
					],
				},
				toolResults: [
					{
						toolCallId: "call_web_fetch",
						content: JSON.stringify({
							provider: "fetch",
							url: "https://example.com/spec",
							final_url: "https://example.com/spec",
							status: 200,
							content_type: "text/html",
							title: "Gateway Spec",
							text: "Grounded specification text",
							truncated: false,
							returned_chars: 27,
						}),
					},
				],
				usage: {
					datetimeRequests: 0,
					webSearchRequests: 0,
					webSearchResults: 0,
					webSearchExtraResults: 0,
					webFetchRequests: 1,
					advisorRequests: 0,
					imageGenerationRequests: 0,
					applyPatchRequests: 0,
				},
			})
			.mockResolvedValueOnce(null);

		mergeIRUsageTotalsMock.mockReturnValue({
			inputTokens: 11,
			outputTokens: 8,
			totalTokens: 19,
		});
		attachServerToolUsageMock.mockReturnValue({
			inputTokens: 11,
			outputTokens: 8,
			totalTokens: 19,
			_ext: { serverToolUse: { web_fetch_requests: 1 } },
		});
		attachServerToolUsageToRawUsageMock.mockImplementation((usage: any) => usage);

		doRequestWithIRMock
			.mockResolvedValueOnce({
				result: {
					kind: "stream",
					stream: createEmptyStream(),
					upstream: new Response(null, { status: 200 }),
					provider: "openai",
					generationTimeMs: 1,
					bill: { cost_cents: 0, currency: "USD", usage: {} },
					rawResponse: null,
				},
			})
			.mockResolvedValueOnce({
				result: {
					kind: "completed",
					ir: {
						id: "ir_final_fetch_stream",
						model: "openai/gpt-5.4-nano-2026-03-17",
						choices: [
							{
								message: {
									role: "assistant",
									content: [
										{
											type: "text",
											text: "I fetched the spec and extracted the key requirements.",
										},
									],
								},
								finishReason: "stop",
							},
						],
						usage: { inputTokens: 6, outputTokens: 6, totalTokens: 12 },
					},
					upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
					provider: "openai",
					generationTimeMs: 3,
					bill: { cost_cents: 0, currency: "USD", usage: {} },
					rawResponse: {
						id: "chatcmpl_final_fetch_stream",
						created: 1778073808,
						model: "openai/gpt-5.4-nano-2026-03-17",
					},
				},
			});

		encodeProtocolMock.mockReturnValue({
			id: "chatcmpl_final_fetch_stream",
			created: 1778073808,
			model: "openai/gpt-5.4-nano-2026-03-17",
			choices: [
				{
					message: {
						role: "assistant",
						content: "I fetched the spec and extracted the key requirements.",
					},
				},
			],
		});
		buildSyntheticServerToolStreamMock.mockReturnValue(syntheticStream);
		finalizeRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const args = createArgs({ stream: true });
		args.pre.ctx.body.tools = [
			{
				type: "phaseo:web_fetch",
				parameters: { max_chars: 4000 },
			},
		];
		args.pre.ctx.rawBody.tools = [
			{
				type: "phaseo:web_fetch",
				parameters: { max_chars: 4000 },
			},
		];
		args.pre.ctx.body.tool_choice = "phaseo:web_fetch";
		args.pre.ctx.rawBody.tool_choice = "phaseo:web_fetch";

		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(buildSyntheticServerToolStreamMock).toHaveBeenCalledWith({
			protocol: "openai.chat.completions",
			payload: {
				id: "chatcmpl_final_fetch_stream",
				created: 1778073808,
				model: "openai/gpt-5.4-nano-2026-03-17",
				choices: [
					{
						message: {
							role: "assistant",
							content: "I fetched the spec and extracted the key requirements.",
						},
					},
				],
			},
			requestId: "req_server_tools",
			model: "openai/gpt-5.4-nano-2026-03-17",
			created: 1778073808,
			serverToolTrace: [{
				id: "call_web_fetch",
					name: "phaseo_web_fetch",
				arguments: "{\"url\":\"https://example.com/spec\",\"max_chars\":4000}",
				output: "{\"provider\":\"fetch\",\"url\":\"https://example.com/spec\",\"final_url\":\"https://example.com/spec\",\"status\":200,\"content_type\":\"text/html\",\"title\":\"Gateway Spec\",\"text\":\"Grounded specification text\",\"truncated\":false,\"returned_chars\":27}",
			}],
		});

		expect(attachServerToolUsageMock).toHaveBeenCalledWith(
			{
				inputTokens: 11,
				outputTokens: 8,
				totalTokens: 19,
			},
			{
				datetimeRequests: 0,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 1,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			},
		);

		const finalizeArgs = finalizeRequestMock.mock.calls[0]?.[0];
		expect(finalizeArgs.exec.result.kind).toBe("stream");
		expect(finalizeArgs.exec.result.stream).toBe(syntheticStream);
		expect(finalizeArgs.exec.result.upstream.status).toBe(200);
		expect(finalizeArgs.exec.result.upstream.headers.get("Content-Type")).toBe(
			"text/event-stream",
		);
	});
});
