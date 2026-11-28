import { afterEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const SYSTEMONE_URL = "https://api.venice.ai/api/v1/systemone";

function argsFor(overrides: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "typesafe/jev-1.14.0", state: "I was charged twice this month.",
			questions: { billing: { type: "noul", instructions: "Is this about billing?" } }, ...overrides },
		requestId: "req_venice", workspaceId: "ws_test", providerId: "venice",
		providerModelSlug: "jev-latest", endpoint: "decisions",
		protocol: "phaseo.decisions", capability: "decisions.make", byokMeta: [], meta: {},
	};
}
afterEach(teardownTestRuntime);

describe("Venice Decisions", () => {
	it("maps the Decisions IR to Venice System One and preserves usage", async () => {
		setupRuntimeFromEnv({ VENICE_API_KEY: "venice-test" });
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "typesafe/jev-1.14.0", input: "I was charged twice. Fix it today.", questions: [
			{ type: "predicate", instructions: "Is this about billing?" },
			{ type: "choice", name: "tone", instructions: "What is the tone?", choices: [{ value: "calm" }, { value: "upset" }] },
			{ type: "score", instructions: "How urgent is it?", levels: [{ label: "low" }, { label: "high" }] },
		] }));
		// Response shape from https://docs.venice.ai/api-reference/endpoint/decisions/systemone.
		const mock = installFetchMock([{ match: url => url === SYSTEMONE_URL,
			response: jsonResponse({ model: "jev-latest", answers: {
				question_0: { type: "noul", noul: 0.92 },
				question_1: { type: "choice", choice: "1", confidence: 0.49, probabilities: { "0": 0.25, "1": 0.75 } },
				question_2: { type: "score", score: 0.6, confidence: 0.1, legend: { "0": "low", "1": "high" }, probabilities: { "0": 0.4, "1": 0.6 } },
			}, usage: { input_tokens: 312, output_tokens: 48 } }),
		}]);
		try {
			const result = await executor({ ...argsFor(), ir, meta: { returnUpstreamRequest: true } });
			expect(result.upstream.status).toBe(200);
			expect(mock.calls[0].headers.Authorization).toBe("Bearer venice-test");
			expect(mock.calls[0].bodyJson).toEqual({ model: "jev-latest", state: ir.state, questions: ir.questions });
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
			const response = encodeDecisionsResponse(result.ir as IRDecisionsResponse, ir);
			expect(response.answers).toEqual([
				{ type: "predicate", name: null, probability: 0.92 },
				{ type: "choice", name: "tone", choice: "upset", confidence: 0.49, probabilities: [
					{ value: "calm", probability: 0.25 }, { value: "upset", probability: 0.75 },
				] },
				{ type: "score", name: null, score: 0.6, confidence: 0.1, probabilities: [
					{ value: 0, label: "low", probability: 0.4 }, { value: 1, label: "high", probability: 0.6 },
				] },
			]);
			expect(result.bill.usage).toMatchObject({ requests: 1, input_tokens: 312, input_text_tokens: 312, output_tokens: 48 });
		} finally { mock.restore(); }
	});

	it("forwards inline PNG and JPEG images in the top-level images field", async () => {
		setupRuntimeFromEnv({ VENICE_API_KEY: "venice-test" });
		const images = ["data:image/png;base64,eA==", { content_type: "image/jpeg" as const, base64: "eA==" }];
		const mock = installFetchMock([{ match: url => url === SYSTEMONE_URL,
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 900, output_tokens: 1 } }),
		}]);
		try {
			expect((await executor(argsFor({ images }))).upstream.status).toBe(200);
			expect(mock.calls[0].bodyJson.images).toEqual(images);
		} finally { mock.restore(); }
	});

	it("returns a 502 for a response whose answers do not match the questions", async () => {
		setupRuntimeFromEnv({ VENICE_API_KEY: "venice-test" });
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
		{ images: [{ content_type: "image/webp", base64: "eA==" }] },
		{ images: ["https://example.com/a.png"] },
		{ images: Array.from({ length: 5 }, () => "data:image/png;base64,eA==") },
		{ videos: ["https://example.com/video.mp4"] },
		{ audio: [{ type: "audio", source: "url", data: "https://example.com/audio.wav" }] },
		{ state: ["Classify", { type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] },
		{ rawRequest: { stream: true } }, { rawRequest: { tools: [] } }, { rawRequest: { temperature: 0.5 } },
		{ rawRequest: { service_tier: "fast" } }, { rawRequest: { safety_identifier: "user" } },
		{ providerOptions: { typesafe: { long_context: true } } },
		{ questions: { box: { type: "box", instructions: "Find it" } } },
		{ questions: { amount: { type: "number", instructions: "How much?" } } },
	] satisfies Partial<IRDecisionsRequest>[])("rejects unsupported requests without fetching: %j", async override => {
		setupRuntimeFromEnv({ VENICE_API_KEY: "venice-test" });
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
