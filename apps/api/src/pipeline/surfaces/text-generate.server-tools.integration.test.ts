import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";

const doRequestWithIRMock = vi.fn();
const finalizeRequestMock = vi.fn();
const getResponseCacheMock = vi.fn();
const settleNonBillableFailureMock = vi.fn();

vi.mock("../execute", () => ({
	doRequestWithIR: (...args: any[]) => doRequestWithIRMock(...args),
}));

vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => finalizeRequestMock(...args),
	settleNonBillableFailure: (...args: any[]) => settleNonBillableFailureMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: (...args: any[]) => getResponseCacheMock(...args),
	ensureRuntimeForBackground: vi.fn(() => () => {}),
	getBindings: vi.fn(() => ({})),
	dispatchBackground: vi.fn(),
}));

import { runTextGeneratePipeline } from "./text-generate";

function buildSseStream(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) {
				controller.enqueue(encoder.encode(frame));
			}
			controller.close();
		},
	});
}

function createStreamResult(stream: ReadableStream<Uint8Array>) {
	return {
		ok: true,
		result: {
			kind: "stream" as const,
			stream,
			upstream: new Response(null, { status: 200 }),
			provider: "openai",
			generationTimeMs: 1,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: {},
			},
			rawResponse: null,
		},
	};
}

function createArgs() {
	const body = {
		model: "openai/gpt-5.4-nano",
		input: [{ role: "user", content: "What is the time?" }],
		stream: true,
		tools: [
			{
				type: "gateway:datetime",
				parameters: { timezones: ["Europe/London", "UTC"] },
			},
		],
	};

	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "responses",
				capability: "text.generate",
				requestId: "req_datetime_pipeline",
				protocol: "openai.responses",
				meta: {
					debug: undefined,
					returnMeta: false,
					before_ms: 8,
				},
				rawBody: JSON.parse(JSON.stringify(body)),
				body: JSON.parse(JSON.stringify(body)),
				model: "openai/gpt-5.4-nano",
				workspaceId: "ws_123",
				stream: true,
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
		},
		req: new Request("https://example.com/v1/responses", {
			method: "POST",
		}),
		endpoint: "responses" as const,
		timing: {
			timer: new Timer(),
			internal: {
				adapterMarked: false,
			},
		},
	};
}

describe("runTextGeneratePipeline Responses server tools integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getResponseCacheMock.mockReturnValue(null);
		finalizeRequestMock.mockImplementation(async (args: any) => {
			return new Response(args.exec.result.stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		});
	});

	it.each([
		["chat.completions", "length", false],
		["chat.completions", "stop", false],
		["responses", "length", false],
		["responses", "stop", false],
		["chat.completions", "length", true],
		["chat.completions", "stop", true],
	] as const)("returns reasoning-only %s responses with %s termination (provider stream: %s)", async (endpoint, finishReason, providerStream) => {
		const args = createArgs();
		const body = {
			model: "poolside/laguna-s-2.1:free",
			...(endpoint === "responses"
				? { input: "hello" }
				: { messages: [{ role: "user", content: "hello" }] }),
			stream: false,
		};
		args.pre.ctx.body = body;
		args.pre.ctx.rawBody = body;
		args.pre.ctx.stream = false;
		args.pre.ctx.model = body.model;
		args.pre.ctx.protocol = endpoint === "responses" ? "openai.responses" : "openai.chat.completions";
		args.pre.ctx.endpoint = endpoint;
		const rawResponse = {
			id: "poolside_reasoning_only",
			model: body.model,
			choices: [{
				index: 0,
				message: { role: "assistant", content: null, reasoning_content: "Partial reasoning." },
				finish_reason: finishReason,
			}],
			usage: { prompt_tokens: 10, completion_tokens: 6500, total_tokens: 6510,
				completion_tokens_details: { reasoning_tokens: 6500 } },
		};
		const result = {
			kind: "completed",
			provider: "poolside",
			ir: openAIChatToIR(rawResponse, args.pre.ctx.requestId, body.model, "poolside"),
			upstream: new Response(JSON.stringify(rawResponse), { status: 200 }),
			rawResponse,
			bill: { cost_cents: 0, currency: "USD", usage: rawResponse.usage, finish_reason: finishReason },
		};
		const executionResult = providerStream ? {
			...result,
			kind: "stream",
			ir: undefined,
			stream: buildSseStream([
				`data: ${JSON.stringify({
					id: rawResponse.id,
					object: "chat.completion.chunk",
					model: body.model,
					choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Partial reasoning." }, finish_reason: null }],
				})}\n\n`,
				`data: ${JSON.stringify({
					id: rawResponse.id,
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
					usage: rawResponse.usage,
				})}\n\n`,
				"data: [DONE]\n\n",
			]),
		} : result;
		doRequestWithIRMock.mockResolvedValueOnce({ ok: true, result: executionResult });
		finalizeRequestMock.mockImplementationOnce(async ({ exec }: any) =>
			Response.json(exec.result.normalized, { status: exec.result.upstream.status }),
		);

		const response = await runTextGeneratePipeline({ ...args, endpoint });
		expect(response.status).toBe(200);
		const payload = await response.json() as any;
		if (endpoint === "chat.completions") {
			expect(payload.choices).toHaveLength(1);
			expect(payload.choices[0]).toMatchObject({
				message: { content: "", reasoning_content: "Partial reasoning." },
				finish_reason: finishReason,
			});
		} else {
			expect(payload.output).toEqual([{
				type: "reasoning",
				content: [{ type: "output_text", text: "Partial reasoning.", annotations: [] }],
			}]);
			expect(payload.status).toBe(finishReason === "length" ? "incomplete" : "completed");
		}
		expect(payload.usage.output_tokens).toBe(6500);
		expect(settleNonBillableFailureMock).not.toHaveBeenCalled();
		expect(finalizeRequestMock).toHaveBeenCalledOnce();
		expect(finalizeRequestMock.mock.calls[0][0].exec.result.bill).toEqual(result.bill);
	});

	it("returns an HTTP validation error before starting SSE", async () => {
		const args = createArgs();
		args.pre.ctx.body.response_format = { type: "json_schema", json_schema: null };
		const response = await runTextGeneratePipeline(args);
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.text()).not.toContain("response.created");
		expect(doRequestWithIRMock).not.toHaveBeenCalled();
	});

	it("preserves an immediate upstream error status", async () => {
		doRequestWithIRMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "upstream unavailable" } }), {
			status: 502,
			headers: { "content-type": "application/json" },
		}));
		const response = await runTextGeneratePipeline(createArgs());
		expect(response.status).toBe(502);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.text()).toContain("upstream unavailable");
	});

	it("does not start a tool follow-up after the client cancels", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const encoder = new TextEncoder();
		const initial = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode('event: response.function_call_arguments.done\ndata: {"item_id":"call_datetime","output_index":0,"name":"gateway_datetime","arguments":"{\\"timezones\\":[]}"}\n\n'));
				await gate;
				controller.enqueue(encoder.encode('event: response.completed\ndata: {"response":{"id":"first","status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}\n\n'));
				controller.close();
			},
		});
		doRequestWithIRMock.mockResolvedValueOnce(createStreamResult(initial));
		const response = await runTextGeneratePipeline(createArgs());
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();
		release();
		await vi.waitFor(() => expect(finalizeRequestMock).toHaveBeenCalledTimes(1));
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(1);
	});

	it("delivers text before the first model turn finishes and then streams the tool follow-up", async () => {
		const encoder = new TextEncoder();
		let releaseFirstTurn!: () => void;
		const firstTurnDone = new Promise<void>((resolve) => { releaseFirstTurn = resolve; });
		const initialStream = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"output_index":0,"delta":"Let me check. "}\n\n'));
				await firstTurnDone;
				controller.enqueue(encoder.encode('event: response.function_call_arguments.done\ndata: {"item_id":"call_datetime","output_index":1,"name":"gateway_datetime","arguments":"{\\"timezones\\":[]}"}\n\n'));
				controller.enqueue(encoder.encode('event: response.completed\ndata: {"response":{"id":"first","status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}\n\n'));
				controller.close();
			},
		});
		const followUpStream = buildSseStream([
			'event: response.output_text.delta\ndata: {"output_index":0,"delta":"It is 10:35 UTC."}\n\n',
			'event: response.completed\ndata: {"response":{"id":"last","status":"completed","usage":{"input_tokens":12,"output_tokens":6}}}\n\n',
		]);
		doRequestWithIRMock
			.mockResolvedValueOnce(createStreamResult(initialStream))
			.mockResolvedValueOnce(createStreamResult(followUpStream));

		const response = await runTextGeneratePipeline(createArgs());
		const reader = response.body!.getReader();
		const first = await reader.read();
		const second = await reader.read();
		expect(new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value)).toContain("Let me check.");
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(1);
		releaseFirstTurn();
		let remaining = "";
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			remaining += new TextDecoder().decode(chunk.value);
		}
		expect(remaining).toContain("It is 10:35 UTC.");
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(2);
	});

	it("executes gateway datetime after an OpenAI Responses stream includes a generic tool_call shadow", async () => {
		const initialToolCallStream = buildSseStream([
			`event: response.created\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					model: "gpt-5.4-nano",
					status: "in_progress",
				},
			})}\n\n`,
			`event: response.reasoning_text.delta\ndata: ${JSON.stringify({
				item_id: "rs_datetime",
				output_index: 0,
				delta: "Need the current time.",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "call_datetime",
				output_index: 1,
				name: "gateway_datetime",
				arguments: "{\"timezones\":[]}",
			})}\n\n`,
			`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
				item_id: "fc_shadow",
				output_index: 2,
				name: "tool_call",
				arguments: "{\"timezones\":[]}",
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime",
					object: "response",
					model: "gpt-5.4-nano",
					status: "completed",
					usage: {
						input_tokens: 101,
						output_tokens: 18,
						total_tokens: 119,
					},
				},
			})}\n\n`,
			"data: [DONE]\n\n",
		]);

		const finalAnswerStream = buildSseStream([
			`event: response.created\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime_final",
					object: "response",
					model: "gpt-5.4-nano",
					status: "in_progress",
				},
			})}\n\n`,
			`event: response.output_text.delta\ndata: ${JSON.stringify({
				item_id: "msg_final",
				output_index: 0,
				delta: "Right now, the time in UTC is 10:35:03.",
			})}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({
				response: {
					id: "resp_datetime_final",
					object: "response",
					model: "gpt-5.4-nano",
					status: "completed",
					output: [{
						type: "message",
						role: "assistant",
						content: [{
							type: "output_text",
							text: "Right now, the time in UTC is 10:35:03.",
						}],
					}],
					usage: {
						input_tokens: 30,
						output_tokens: 10,
						total_tokens: 40,
					},
				},
			})}\n\n`,
			"data: [DONE]\n\n",
		]);

		doRequestWithIRMock
			.mockResolvedValueOnce(createStreamResult(initialToolCallStream))
			.mockResolvedValueOnce(createStreamResult(finalAnswerStream));

		const response = await runTextGeneratePipeline(createArgs());
		const streamText = await response.text();

		expect(response.status).toBe(200);
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(2);

		const followUpRequest = doRequestWithIRMock.mock.calls[1]?.[1];
		expect(followUpRequest.messages).toHaveLength(3);
		expect(followUpRequest.messages[1]).toMatchObject({
			role: "assistant",
			toolCalls: [{ id: "call_datetime", name: "gateway_datetime" }],
		});
		expect(followUpRequest.messages[2]).toMatchObject({
			role: "tool",
			toolResults: [{ toolCallId: "call_datetime" }],
		});

		expect(streamText).toContain("Right now, the time in UTC is 10:35:03.");
		expect(streamText).not.toContain("\"name\":\"tool_call\"");
		expect(streamText).toContain("\"name\":\"gateway_datetime\"");
		expect(streamText).toContain("\"output_index\":1");
		expect(streamText).toContain("\"output\":");
		expect(streamText).toContain("timezones");
		const completedFrame = streamText.split("\n\n").find((frame) => frame.includes("event: response.completed"))!;
		const completedPayload = JSON.parse(completedFrame.split("data: ")[1]);
		expect(completedPayload.response.output).toContainEqual(expect.objectContaining({
			type: "function_call",
			id: "call_datetime",
			call_id: "call_datetime",
		}));
		const normalized = finalizeRequestMock.mock.calls[0]?.[0]?.exec?.result?.normalized;
		expect(normalized.output).toEqual([{
			type: "message",
			role: "assistant",
			content: [{
				type: "output_text",
				text: "Right now, the time in UTC is 10:35:03.",
				annotations: [],
			}],
		}]);
		expect(normalized.usage.server_tool_use).toMatchObject({
			datetime_requests: 1,
		});
	});
});
