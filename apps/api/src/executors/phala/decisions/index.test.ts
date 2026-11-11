import { afterEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

function argsFor(overrides: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "jaredpalmer/kev-4b", state: "I was charged twice this month.",
			questions: { billing: { type: "noul", instructions: "Is this about billing?" } }, ...overrides },
		requestId: "req_phala", workspaceId: "ws_test", providerId: "phala",
		providerModelSlug: "jaredpalmer/kev-4b", endpoint: "decisions",
		protocol: "phaseo.decisions", capability: "decisions.make", byokMeta: [], meta: {},
	};
}
afterEach(teardownTestRuntime);

describe("Phala Decisions", () => {
	it("maps the Decisions IR to RedPill System One and preserves usage", async () => {
		setupRuntimeFromEnv({ PHALA_API_KEY: "phala-test", PHALA_BASE_URL: "https://api.redpill.ai" });
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "jaredpalmer/kev-4b", input: "I was charged twice. Fix it today.", questions: [
			{ type: "predicate", instructions: "Is this about billing?" },
			{ type: "choice", name: "tone", instructions: "What is the tone?", choices: [{ value: "calm" }, { value: "upset" }] },
			{ type: "score", instructions: "How urgent is it?", levels: [{ label: "low" }, { label: "high" }] },
		] }));
		// Response shape from https://docs.redpill.ai/api-reference/systemone.md (usage also carries cost).
		const mock = installFetchMock([{ match: url => url === "https://api.redpill.ai/v1/systemone",
			response: jsonResponse({ model: "jaredpalmer/kev-4b", answers: {
				question_0: { type: "noul", noul: 0.8828 },
				question_1: { type: "choice", choice: "1", confidence: 0.4882, probabilities: { "0": 0.2559, "1": 0.7441 } },
				question_2: { type: "score", score: 0.6, confidence: 0.1, legend: { "0": "low", "1": "high" }, probabilities: { "0": 0.4, "1": 0.6 } },
			}, usage: { input_tokens: 57, output_tokens: 167, cost: 0.000002394 } }),
		}]);
		try {
			const result = await executor({ ...argsFor(), ir, meta: { returnUpstreamRequest: true } });
			expect(result.upstream.status).toBe(200);
			expect(mock.calls[0].headers.Authorization).toBe("Bearer phala-test");
			expect(mock.calls[0].bodyJson).toEqual({ model: "jaredpalmer/kev-4b", state: ir.state, questions: ir.questions });
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
			const response = encodeDecisionsResponse(result.ir as IRDecisionsResponse, ir);
			expect(response.model).toBe("jaredpalmer/kev-4b");
			expect(response.answers).toEqual([
				{ type: "predicate", name: null, probability: 0.8828 },
				{ type: "choice", name: "tone", choice: "upset", confidence: 0.4882, probabilities: [
					{ value: "calm", probability: 0.2559 }, { value: "upset", probability: 0.7441 },
				] },
				{ type: "score", name: null, score: 0.6, confidence: 0.1, probabilities: [
					{ value: 0, label: "low", probability: 0.4 }, { value: 1, label: "high", probability: 0.6 },
				] },
			]);
			expect(result.bill.usage).toMatchObject({ requests: 1, input_tokens: 57, input_text_tokens: 57, output_tokens: 167, total_tokens: 224 });
		} finally { mock.restore(); }
	});

	it("uses Phala's default base URL when PHALA_BASE_URL is not set", async () => {
		setupRuntimeFromEnv({ PHALA_API_KEY: "phala-test" });
		const mock = installFetchMock([{ match: url => url === "https://inference.phala.com/v1/systemone",
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } }),
		}]);
		try {
			expect((await executor(argsFor())).upstream.status).toBe(200);
			expect(mock.calls).toHaveLength(1);
		} finally { mock.restore(); }
	});

	it("returns a 502 for a response whose answers do not match the questions", async () => {
		setupRuntimeFromEnv({ PHALA_API_KEY: "phala-test", PHALA_BASE_URL: "https://api.redpill.ai" });
		const mock = installFetchMock([{ match: () => true,
			response: jsonResponse({ answers: { other: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } }),
		}]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});

	it.each([
		{ images: ["data:image/png;base64,eA=="] }, { videos: ["https://example.com/video.mp4"] },
		{ audio: [{ type: "audio", source: "url", data: "https://example.com/audio.wav" }] },
		{ state: ["Classify", { type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] },
		{ rawRequest: { stream: true } }, { rawRequest: { tools: [] } }, { rawRequest: { temperature: 0.5 } },
		{ rawRequest: { service_tier: "fast" } }, { rawRequest: { safety_identifier: "user" } },
		{ providerOptions: { typesafe: { long_context: true } } },
		{ questions: { box: { type: "box", instructions: "Find it" } } },
	] satisfies Partial<IRDecisionsRequest>[])("rejects unsupported requests without fetching: %j", async override => {
		setupRuntimeFromEnv({ PHALA_API_KEY: "phala-test" });
		const mock = installFetchMock([]);
		try {
			const result = await executor(argsFor(override));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(result.bill.usage).toBeUndefined();
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
});
