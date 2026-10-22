import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(overrides?: Partial<IRChatRequest>): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "x-ai/grok-4-0709",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		...overrides,
	};
	return {
		ir,
		requestId: "req_xai_test",
		workspaceId: "team_test",
		providerId: "x-ai",
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
		},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("x-ai text executor", () => {
	it("always sends store:false on responses requests", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: jsonResponse({
				id: "resp_xai_1",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "grok-4",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 4,
					output_tokens: 2,
					total_tokens: 6,
				},
			}, { status: 200 }),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.stream).toBe(true);
		expect(mock.calls[0]?.bodyJson?.store).toBe(false);
		expect(mock.calls[0]?.headers["Idempotency-Key"] ?? mock.calls[0]?.headers["idempotency-key"]).toBe("req_xai_test");
		const mapped = JSON.parse(result.mappedRequest || "{}");
		expect(mapped.store).toBe(false);
	});

	it("does not replay failed x-ai requests via adaptive retry", async () => {
		let callCount = 0;
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: () => {
				callCount += 1;
				if (callCount === 1) {
					return jsonResponse(
						{ error: { message: "unsupported parameter: temperature" } },
						{ status: 400 },
					);
				}
				if (callCount === 2) {
					return jsonResponse(
						{ error: { message: "unsupported parameter: top_p" } },
						{ status: 400 },
					);
				}
				return jsonResponse({ error: { message: "unexpected extra replay" } }, { status: 500 });
			},
		}]);

		const result = await executor(buildArgs({
			temperature: 0.7,
			topP: 0.9,
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.upstream.status).toBe(400);
		expect(mock.calls).toHaveLength(1);
	});

	it("normalizes usage with cached input as subset (no double count)", async () => {
		const card = {
			provider: "x-ai",
			model: "x-ai/grok-4-0709",
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
			match: (url) => url.includes("/responses"),
			response: jsonResponse({
				id: "resp_xai_2",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "grok-4",
				status: "completed",
				output: [{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "ok" }],
				}],
				usage: {
					input_tokens: 123,
					output_tokens: 8,
					total_tokens: 131,
					input_tokens_details: {
						cached_tokens: 64,
					},
				},
			}, { status: 200 }),
		}]);

		const result = await executor({
			...buildArgs(),
			pricingCard: card,
		});
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.bill.usage).toMatchObject({
			input_text_tokens: 59,
			cached_read_text_tokens: 64,
			output_text_tokens: 8,
		});
	});

	// xAI's documented Responses usage: reasoning outside output_tokens, total = 32 + 9 + 110
	// (https://docs.x.ai/openapi.json), plus server_side_tool_usage_details.
	const XAI_USAGE = {
		input_tokens: 32,
		input_tokens_details: { cached_tokens: 8 },
		output_tokens: 9,
		output_tokens_details: { reasoning_tokens: 110 },
		total_tokens: 151,
		num_server_side_tools_used: 4,
		server_side_tool_usage_details: {
			web_search_calls: 2,
			x_search_calls: 1,
			x_posts_fetched: 10,
			x_users_fetched: 3,
			code_interpreter_calls: 1,
			file_search_calls: 0,
			mcp_calls: 0,
			document_search_calls: 0,
			image_generation_calls: 0,
		},
	};
	const XAI_TOOL_METERS = {
		native_web_search_requests: 2,
		native_code_execution_requests: 1,
		native_x_search_posts: 10,
		native_x_search_users: 3,
	};

	it("bills reasoning tokens and server-side tools on buffered responses", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: jsonResponse({
				id: "resp_xai_3",
				object: "response",
				created_at: Math.floor(Date.now() / 1000),
				model: "grok-4.7",
				status: "completed",
				output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
				usage: XAI_USAGE,
			}, { status: 200 }),
		}]);
		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.bill.usage).toMatchObject({ output_tokens: 119, output_text_tokens: 119, ...XAI_TOOL_METERS });
		expect(result.ir?.usage?.outputTokens).toBe(119);
	});

	it("bills streamed responses from the upstream usage, with reasoning and tools", async () => {
		const sse = [
			`event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "resp_xai_4", status: "in_progress", output: [] } })}\n\n`,
			`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "resp_xai_4", status: "completed", output: [], usage: XAI_USAGE } })}\n\n`,
		].join("");
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
		}]);
		const result = await executor(buildArgs({ stream: true }));
		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") return;
		const clientFrames = await new Response(result.stream).text();
		mock.restore();

		// The client sees the same output count the request is billed for.
		const completed = clientFrames.split("\n\n").map((block) => block.split("\n").find((line) => line.startsWith("data: "))?.slice(6))
			.filter((data): data is string => Boolean(data))
			.map((data) => JSON.parse(data))
			.find((payload) => payload.type === "response.completed");
		expect(completed?.response?.usage?.output_tokens).toBe(119);
		expect(result.usageFinalizerAuthoritative).toBe(true);
		const finalized = await result.usageFinalizer();
		expect(finalized?.usage).toMatchObject({
			input_text_tokens: 24,
			cached_read_text_tokens: 8,
			output_text_tokens: 119,
			...XAI_TOOL_METERS,
			server_tool_use: { web_search_requests: 2, code_execution_requests: 1, x_search_posts: 10, x_search_users: 3 },
		});
	});

	it("sends json_schema structured outputs to xAI unchanged", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: jsonResponse({
				id: "resp_xai_5",
				object: "response",
				status: "completed",
				output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "{}" }] }],
				usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
			}, { status: 200 }),
		}]);
		const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
		await executor(buildArgs({
			messages: [
				{ role: "system", content: [{ type: "text", text: "Be terse." }] },
				{ role: "user", content: [{ type: "text", text: "hello" }] },
			],
			responseFormat: { type: "json_schema", name: "answer", schema, strict: true } as any,
		}));
		mock.restore();

		const body = mock.calls[0]?.bodyJson;
		expect(body?.text?.format).toMatchObject({ type: "json_schema", schema });
		expect(JSON.stringify(body?.input)).not.toContain("The JSON must match this schema");
	});
});
