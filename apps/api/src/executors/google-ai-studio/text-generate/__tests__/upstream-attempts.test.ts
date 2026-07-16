import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("google-ai-studio upstream attempts", () => {
	it("records every native retry before the successful response", async () => {
		let calls = 0;
		const mock = installFetchMock([{
			match: (url) => url.includes("models/lyria-3-pro-preview:generateContent"),
			response: () => {
				calls += 1;
				if (calls === 1) {
					return jsonResponse({ error: { message: "temporary failure" } }, { status: 500 });
				}
				return jsonResponse({
					responseId: "gemini_retry_ok",
					modelVersion: "lyria-3-pro-preview",
					candidates: [{
						index: 0,
						content: { parts: [{ text: "Recovered" }] },
						finishReason: "STOP",
					}],
					usageMetadata: {
						promptTokenCount: 4,
						candidatesTokenCount: 2,
						totalTokenCount: 6,
					},
				});
			},
		}]);

		const result = await execute({
			ir: {
				model: "google/lyria-3-pro-preview",
				stream: false,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			},
			requestId: "req_gemini_upstream_attempts",
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			endpoint: "responses",
			protocol: "openai.responses",
			capability: "text.generate",
			providerModelSlug: "lyria-3-pro-preview",
			capabilityParams: null,
			byokMeta: [],
			pricingCard: null as any,
			meta: { returnUpstreamRequest: true },
		} as ExecutorExecuteArgs);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstreamAttempts).toHaveLength(2);
		expect(result.upstreamAttempts?.map((attempt) => ({
			status: attempt.status,
			outcome: attempt.outcome,
		}))).toEqual([
			{ status: 500, outcome: "upstream_non_2xx" },
			{ status: 200, outcome: "success" },
		]);
	});
});
