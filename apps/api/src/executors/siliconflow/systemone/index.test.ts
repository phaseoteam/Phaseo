import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

function buildArgs(overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "typesafe/kev-4b",
			state: { ticket: "Shoes arrived in the wrong size.", order_status: "delivered" },
			questions: {
				returns: {
					type: "noul",
					instructions: "Does this need a return?",
				},
			},
		},
		requestId: "req_siliconflow_kev_test",
		workspaceId: "team_test",
		providerId: "siliconflow",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "Kev-4b",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as ExecutorExecuteArgs;
}

beforeEach(() => setupRuntimeFromEnv({ SILICONFLOW_API_KEY: "siliconflow-test-key" } as any));
afterEach(teardownTestRuntime);

describe("SiliconFlow System One executor", () => {
	it("sends the native decision payload and reports billable input usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.siliconflow.com/v1/systemone",
			response: jsonResponse({
				model: "Kev-4b",
				answers: { returns: { answer: "yes" } },
				usage: { input_tokens: 24, output_tokens: 0 },
			}),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(mock.calls[0]?.method).toBe("POST");
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer siliconflow-test-key");
			expect(mock.calls[0]?.bodyJson).toEqual({
				model: "Kev-4b",
				state: { ticket: "Shoes arrived in the wrong size.", order_status: "delivered" },
				questions: {
					returns: {
						type: "noul",
						instructions: "Does this need a return?",
					},
				},
			});
			expect(result.kind).toBe("completed");
			expect(result.ir).toMatchObject({
				model: "typesafe/kev-4b",
				answers: { returns: { answer: "yes" } },
				usage: { inputTokens: 24, outputTokens: 0, totalTokens: 24 },
			});
			expect(result.bill.usage).toMatchObject({
				requests: 1,
				input_tokens: 24,
				output_tokens: 0,
				total_tokens: 24,
			});
		} finally {
			mock.restore();
		}
	});

	it("fails closed when input-token usage is missing", async () => {
		const malformedPayload = { model: "Kev-4b", answers: { returns: { answer: "yes" } }, usage: {} };
		const mock = installFetchMock([{
			match: (url) => url === "https://api.siliconflow.com/v1/systemone",
			response: jsonResponse(malformedPayload),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
			expect(result.rawResponse).toEqual(malformedPayload);
		} finally {
			mock.restore();
		}
	});

	it("retains a non-JSON success body for internal diagnostics", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.siliconflow.com/v1/systemone",
			response: new Response("unexpected upstream body"),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(502);
			expect(result.rawResponse).toBe("unexpected upstream body");
		} finally {
			mock.restore();
		}
	});

	it("passes provider errors through without converting them to success", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.siliconflow.com/v1/systemone",
			response: jsonResponse({ error: "rate_limited" }, { status: 429 }),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(429);
			expect(result.keySource).toBe("gateway");
		} finally {
			mock.restore();
		}
	});
});
