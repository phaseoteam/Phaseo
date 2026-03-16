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
		teamId: "team_test",
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
});
