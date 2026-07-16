import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { readSseFrames, parseSseJson } from "../../../../tests/helpers/sse";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

function buildArgs(overrides?: Partial<IRChatRequest>): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "openai/gpt-5-nano-2025-08-07",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		...overrides,
	};
	return {
		ir,
		requestId: "req_openai_http_test",
		workspaceId: "team_test",
		providerId: "openai",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {
			returnUpstreamRequest: true,
			debug: {
				return_upstream_request: true,
			},
			beta: {
				openai_websocket_mode: true,
			},
		},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("openai text executor HTTP mode", () => {
	it("uses HTTP responses endpoint for OpenAI even when websocket beta flag is set", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_1",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "http path ok" }],
				}],
				usage: {
					input_tokens: 4,
					output_tokens: 3,
					total_tokens: 7,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.method).toBe("POST");
		expect(mock.calls[0]?.headers.Upgrade).toBeUndefined();
		expect(mock.calls[0]?.headers["Idempotency-Key"] ?? mock.calls[0]?.headers["idempotency-key"]).toBe("req_openai_http_test");
		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toMatchObject({
			type: "text",
			text: "http path ok",
		});
		const mapped = JSON.parse(result.mappedRequest || "{}");
		expect(mapped.type).toBeUndefined();
		expect(mapped.model).toBe("openai/gpt-5-nano-2025-08-07");
		expect(mapped.metadata?.phaseo_request_id).toBe("req_openai_http_test");
		expect(mapped.safety_identifier).toBe("team_test");
		expect(mock.calls[0]?.bodyJson?.store).toBe(false);
	});

	it("uses native chat completions for OpenAI chat requests without reasoning", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/chat/completions",
			response: new Response([
				`data: ${JSON.stringify({
					id: "chatcmpl_native_1",
					object: "chat.completion.chunk",
					created: Math.floor(Date.now() / 1000),
					model: "gpt-5.4-nano",
					choices: [{ index: 0, delta: { role: "assistant", content: "hello" }, finish_reason: null }],
				})}`,
				"",
				`data: ${JSON.stringify({
					id: "chatcmpl_native_1",
					object: "chat.completion.chunk",
					created: Math.floor(Date.now() / 1000),
					model: "gpt-5.4-nano",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
				})}`,
				"",
				"data: [DONE]",
				"",
			].join("\n"), {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		}]);

		const result = await executor({
			...buildArgs({
				model: "openai/gpt-5.4-nano",
				stream: true,
				maxTokens: 128,
			}),
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
		});
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
		expect(mock.calls[0]?.bodyJson?.max_completion_tokens).toBe(128);
		expect(mock.calls[0]?.bodyJson?.max_tokens).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.metadata).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.safety_identifier).toBe("team_test");
		expect(mock.calls[0]?.bodyJson?.stream).toBe(true);
	});

	it("streams over HTTP responses endpoint when tools are present", async () => {
		const streamBody = [
			"event: response.created",
			`data: ${JSON.stringify({
				type: "response.created",
				response: {
					id: "resp_stream_1",
					object: "response",
					created_at: Math.floor(Date.now() / 1000),
					model: "gpt-5-nano",
					status: "in_progress",
					output: [],
				},
			})}`,
			"",
			"event: response.output_text.delta",
			`data: ${JSON.stringify({
				type: "response.output_text.delta",
				delta: "hello",
			})}`,
			"",
			"event: response.completed",
			`data: ${JSON.stringify({
				type: "response.completed",
				response: {
					id: "resp_stream_1",
					object: "response",
					created_at: Math.floor(Date.now() / 1000),
					model: "gpt-5-nano",
					status: "completed",
					output: [{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: "hello" }],
					}],
					usage: { input_tokens: 9, output_tokens: 5, total_tokens: 14 },
				},
			})}`,
			"",
			"data: [DONE]",
			"",
		].join("\n");

		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: new Response(streamBody, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		}]);

		const result = await executor(buildArgs({
			stream: true,
			tools: [{
				name: "lookup_weather",
				parameters: { type: "object" },
			}],
		}));
		mock.restore();

		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.headers.Upgrade).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.stream).toBe(true);
		expect(mock.calls[0]?.bodyJson?.store).toBe(false);
		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;

		const frames = parseSseJson(await readSseFrames(new Response(result.stream)));
		expect(frames.some((entry) => entry?.type === "response.created")).toBe(true);
		expect(frames.some((entry) => entry?.type === "response.output_text.delta")).toBe(true);
		expect(frames.some((entry) => entry?.type === "response.completed")).toBe(true);
	});

	it("forces OpenAI legacy/chat-only models through HTTP /responses route", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_legacy_http_1",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "davinci-002",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "legacy model via responses" }],
				}],
				usage: {
					input_tokens: 3,
					output_tokens: 5,
					total_tokens: 8,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs({
			model: "openai/davinci-002",
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe("https://api.openai.com/v1/responses");
		expect(mock.calls[0]?.headers.Upgrade).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.model).toBe("openai/davinci-002");
	});

	it("returns upstream HTTP errors without websocket fallback", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({ error: { message: "upstream unavailable" } }, { status: 503 }),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(mock.calls).toHaveLength(1);
		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.upstream.status).toBe(503);
		expect(result.ir).toBeUndefined();
	});

	it("does not overwrite caller-provided aistats request id metadata", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_2",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs({
			metadata: {
				phaseo_request_id: "custom_request_id",
				trace_id: "abc123",
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.metadata?.phaseo_request_id).toBe("custom_request_id");
		expect(mock.calls[0]?.bodyJson?.metadata?.trace_id).toBe("abc123");
		expect(mock.calls[0]?.headers["Idempotency-Key"] ?? mock.calls[0]?.headers["idempotency-key"]).toBe("req_openai_http_test");
	});

	it("ignores caller-provided safety identifier and uses workspace id", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_3",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs({
			safetyIdentifier: "safe_user_123",
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.safety_identifier).toBe("team_test");
	});

	it("uses workspace id for OpenAI safety identifier even when the request has a user id", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_3a",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor({
			...buildArgs({
				userId: "user_123",
			}),
			workspaceId: "workspace_safety_scope",
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.safety_identifier).toBe("workspace_safety_scope");
	});

	it("truncates OpenAI safety identifiers to the upstream limit", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_3b",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const longWorkspaceId = `workspace_${"x".repeat(100)}`;
		const result = await executor({
			...buildArgs(),
			workspaceId: longWorkspaceId,
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.safety_identifier).toBe(longWorkspaceId.slice(0, 64));
	});

	it("passes provider_options.openai.context_management to OpenAI responses requests", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_4",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs({
			vendor: {
				openai: {
					context_management: {
						type: "compaction",
						compact_threshold: 0.8,
					},
				},
			} as any,
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.context_management).toEqual({
			type: "compaction",
			compact_threshold: 0.8,
		});
	});

	it("clamps dated gpt-5.4-pro snapshots to the pro reasoning floor", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_5",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5.4-pro-2026-03-05",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs({
			model: "openai/gpt-5.4-pro-2026-03-05",
			reasoning: { effort: "none" },
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.stream).toBe(true);
		expect(mock.calls[0]?.bodyJson?.reasoning).toMatchObject({ effort: "medium" });
	});

	it("preserves max effort and pro mode for GPT-5.6 pro slugs", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_6",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5.6-sol",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 1,
					total_tokens: 3,
				},
			}, { status: 200 }),
		}]);

		const result = await executor({
			...buildArgs({
				model: "openai/gpt-5.6-sol-pro",
				reasoning: { effort: "max" },
			}),
			providerModelSlug: "gpt-5.6-sol-pro",
			capabilityParams: {
				request: {
					allowlist: ["reasoning.effort", "reasoning.mode", "max_tokens"],
				},
			},
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("gpt-5.6-sol");
		expect(mock.calls[0]?.bodyJson?.reasoning).toMatchObject({
			effort: "max",
			mode: "pro",
		});
	});

	it("preserves pro mode when requested on the canonical GPT-5.6 slug", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_7",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5.6-sol",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 2,
					output_tokens: 9,
					output_tokens_details: { reasoning_tokens: 8 },
					total_tokens: 11,
				},
			}, { status: 200 }),
		}]);

		const result = await executor({
			...buildArgs({
				model: "openai/gpt-5.6-sol",
				reasoning: { effort: "max", mode: "pro" },
			}),
			providerModelSlug: "gpt-5.6-sol",
			capabilityParams: {
				request: {
					allowlist: ["reasoning.effort", "reasoning.mode", "max_tokens"],
				},
			},
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("gpt-5.6-sol");
		expect(mock.calls[0]?.bodyJson?.reasoning).toMatchObject({
			effort: "max",
			mode: "pro",
		});
		if (result.kind !== "completed") return;
		expect(result.bill.usage).toMatchObject({
			output_text_tokens: 9,
			reasoning_tokens: 8,
		});
	});

	it("prices cached input as subset (no double count)", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "responses",
			currency: "USD",
			rules: [
				{
					id: "in",
					pricing_plan: "standard",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "2",
					currency: "USD",
					match: [],
					priority: 1,
				},
				{
					id: "cached",
					pricing_plan: "standard",
					meter: "cached_read_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "0.2",
					currency: "USD",
					match: [],
					priority: 1,
				},
				{
					id: "out",
					pricing_plan: "standard",
					meter: "output_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "6",
					currency: "USD",
					match: [],
					priority: 1,
				},
			],
		} as any;

		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse({
				id: "resp_http_cached_1",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "gpt-5-nano",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 123,
					output_tokens: 9,
					total_tokens: 132,
					input_tokens_details: { cached_tokens: 64 },
				},
			}, { status: 200 }),
		}]);

		const result = await executor({
			...buildArgs(),
			pricingCard,
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		const usage = result.bill.usage as Record<string, any> | undefined;
		expect(usage?.input_text_tokens).toBe(59);
		expect(usage?.cached_read_text_tokens).toBe(64);
		expect(usage?.output_text_tokens).toBe(9);
		expect(usage?.cached_read_tokens_are_subset_of_input).toBe(true);
	});
});
