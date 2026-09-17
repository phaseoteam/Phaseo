import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

function buildArgs(overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "typesafe/jev",
			state: { plan: "pro", active_users: 42 },
			questions: {
				segment: {
					type: "choice",
					instructions: "Which segment is this account in?",
					criteria: { startup: "A small company.", enterprise: "A large company." },
				},
			},
		},
		requestId: "req_typesafe_systemone_test",
		workspaceId: "team_test",
		providerId: "typesafe",
		endpoint: "systemone",
		protocol: "typesafe.systemone",
		capability: "decisions.make",
		providerModelSlug: "jev-latest",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as ExecutorExecuteArgs;
}

beforeEach(() => setupRuntimeFromEnv({ TYPESAFE_API_KEY: "typesafe-test-key" } as any));
afterEach(teardownTestRuntime);

describe("TypeSafe System One executor", () => {
	it("posts the keyed question map and normalizes usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({
				model: "jev-latest",
				answers: { segment: { choice: "startup", confidence: 0.94 } },
				usage: { input_tokens: 120, output_tokens: 0 },
			}),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(mock.calls[0]?.method).toBe("POST");
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer typesafe-test-key");
			expect(mock.calls[0]?.bodyJson).toEqual({
				model: "jev-latest",
				state: { plan: "pro", active_users: 42 },
				questions: {
					segment: {
						type: "choice",
						instructions: "Which segment is this account in?",
						criteria: { startup: "A small company.", enterprise: "A large company." },
					},
				},
			});
			expect(result.kind).toBe("completed");
			expect(result.ir).toMatchObject({
				model: "typesafe/jev",
				answers: { segment: { choice: "startup", confidence: 0.94 } },
				usage: { inputTokens: 120, outputTokens: 0, totalTokens: 120 },
			});
			expect(result.bill.usage).toMatchObject({
				requests: 1,
				input_tokens: 120,
				output_tokens: 0,
				total_tokens: 120,
			});
		} finally {
			mock.restore();
		}
	});

	it("preserves TypeSafe error responses for the gateway error handler", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ error: "rate_limited" }, { status: 429 }),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(429);
			expect(result.keySource).toBe("gateway");
			expect(result.bill.cost_cents).toBe(0);
		} finally {
			mock.restore();
		}
	});
});
