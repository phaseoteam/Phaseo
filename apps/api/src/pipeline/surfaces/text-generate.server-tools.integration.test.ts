import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";

const doRequestWithIRMock = vi.fn();
const finalizeRequestMock = vi.fn();
const getResponseCacheMock = vi.fn();

vi.mock("../execute", () => ({
	doRequestWithIR: (...args: any[]) => doRequestWithIRMock(...args),
}));

vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => finalizeRequestMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: (...args: any[]) => getResponseCacheMock(...args),
	ensureRuntimeForBackground: vi.fn(),
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
			let streamText = "";
			const stream = args?.exec?.result?.stream;
			if (stream) {
				streamText = await new Response(stream).text();
			}
			return new Response(
				JSON.stringify({
					kind: args?.exec?.result?.kind,
					normalized: args?.exec?.result?.normalized,
					streamText,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		});
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
		const payload = await response.json() as any;

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

		expect(payload.streamText).toContain("Right now, the time in UTC is 10:35:03.");
		expect(payload.streamText).not.toContain("\"name\":\"tool_call\"");
		expect(payload.streamText).toContain("\"name\":\"gateway_datetime\"");
		expect(payload.streamText).toContain("\"output\":");
		expect(payload.streamText).toContain("timezones");
		expect(payload.normalized.output).toEqual([{
			type: "message",
			role: "assistant",
			content: [{
				type: "output_text",
				text: "Right now, the time in UTC is 10:35:03.",
				annotations: [],
			}],
		}]);
		expect(payload.normalized.usage.server_tool_use).toMatchObject({
			datetime_requests: 1,
		});
	});
});
