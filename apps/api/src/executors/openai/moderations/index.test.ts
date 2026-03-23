import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRModerationsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(ir: IRModerationsRequest, providerModelSlug: string | null = null): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_openai_moderations_test",
		teamId: "team_test",
		providerId: "openai",
		endpoint: "moderations",
		protocol: "openai.moderations",
		capability: "moderations",
		providerModelSlug,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("openai moderations executor", () => {
	it("normalizes provider-prefixed model ids when provider slug is unavailable", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/moderations"),
				response: jsonResponse({
					id: "modr_1",
					model: "omni-moderation-latest",
					results: [{ flagged: false, categories: {}, category_scores: {} }],
					usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(
			buildArgs({
				model: "openai/omni-moderation",
				input: "test input",
			}),
		);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.model).toBe("omni-moderation");
	});

	it("prefers and normalizes provider model slug when present", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/moderations"),
				response: jsonResponse({
					id: "modr_2",
					model: "omni-moderation-latest",
					results: [{ flagged: false, categories: {}, category_scores: {} }],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "openai/omni-moderation",
					input: "test input",
				},
				"openai/omni-moderation-latest",
			),
		);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.model).toBe("omni-moderation-latest");
	});
});
