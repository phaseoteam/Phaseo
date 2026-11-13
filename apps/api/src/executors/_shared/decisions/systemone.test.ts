import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { createUpstreamTimingTracker } from "@executors/_shared/timing/upstream";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";

const providers = [
	{ id: "liquid-ai", model: "d1:free", url: "https://api.liquid.ai/decisions/v1/systemone", outputTokens: 0 },
	{ id: "liquid", model: "d1:free", url: "https://api.liquid.ai/decisions/v1/systemone", outputTokens: 0 },
	{ id: "perplexity", model: "decider-27b", url: "https://api.perplexity.ai/v1/decisions", outputTokens: 3 },
	{ id: "inception", model: "mercury-decide", url: "https://api.inceptionlabs.ai/v1/decisions", outputTokens: 3 },
];
const questions = {
	defect: { type: "noul", instructions: "Does the review report a defect?" },
	sentiment: { type: "choice", instructions: "What is the sentiment?", criteria: { positive: "Satisfied", negative: null } },
	severity: { type: "score", instructions: "How severe is it?", criteria: ["Cosmetic", "Unusable"] },
};
const answers = {
	defect: { type: "noul", noul: 0.9 },
	sentiment: { type: "choice", choice: "negative", probabilities: { positive: 0.1, negative: 0.9 }, confidence: 0.8 },
	severity: { type: "score", score: 0.9, legend: { "0": "Cosmetic", "1": "Unusable" }, probabilities: { "0": 0.1, "1": 0.9 } },
};
function argsFor(provider: typeof providers[number], overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: `${provider.id}/${provider.model}`, state: { review: "The battery stopped charging." }, questions },
		requestId: "req_decisions_test", workspaceId: "team_test", providerId: provider.id,
		endpoint: "decisions", protocol: "phaseo.decisions", capability: "decisions.make",
		providerModelSlug: provider.model, byokMeta: [], pricingCard: { rules: [] }, meta: {}, ...overrides,
	};
}
beforeEach(() => setupRuntimeFromEnv({ LIQUID_AI_API_KEY: "liquid-test", PERPLEXITY_API_KEY: "perplexity-test", INCEPTION_API_KEY: "inception-test" }));
afterEach(teardownTestRuntime);

describe.each(providers)("$id decisions", provider => {
	const execute = resolveProviderExecutor(provider.id, "decisions.make")!;
	it("round-trips the canonical request through the provider wire format", async () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({
			model: `${provider.id}/${provider.model}`, input: "Evidence",
			questions: [
				{ type: "predicate", instructions: "Defect?" },
				{ type: "choice", name: "same", instructions: "Allowed?", choices: [{ value: true }, { value: "true" }] },
				{ type: "score", name: "same", instructions: "Severity?", levels: [{ label: "Low" }, { label: "High" }] },
			],
		}));
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse({
			answers: {
				question_0: { type: "noul", noul: 0.9 },
				question_1: { type: "choice", choice: "1", probabilities: { "0": 0.1, "1": 0.9 }, confidence: 0.8 },
				question_2: { type: "score", score: 0.9, probabilities: { "0": 0.1, "1": 0.9 }, confidence: 0.8 },
			}, usage: { input_tokens: 12, output_tokens: provider.outputTokens },
		}) }]);
		try {
			const result = await execute(argsFor(provider, { ir }));
			expect(mock.calls[0].bodyJson).toMatchObject({ state: "Evidence", questions: ir.questions });
			const response = encodeDecisionsResponse(result.ir as any, ir);
			expect(response.answers).toMatchObject([
				{ type: "predicate", name: null, probability: 0.9 },
				{ type: "choice", name: "same", choice: "true" },
				{ type: "score", name: "same", score: 0.9, probabilities: [{ label: "Low" }, { label: "High" }] },
			]);
		} finally { mock.restore(); }
	});
	it("uses the native URL, preserves typed answers and reconciles actual usage", async () => {
		const timing = createUpstreamTimingTracker();
		const mock = installFetchMock([{ match: url => url === provider.url,
			response: jsonResponse({ model: provider.model, answers, usage: { input_tokens: 120, output_tokens: provider.outputTokens } },
				{ headers: { "x-request-id": "upstream-test" } }),
		}]);
		try {
			const args = argsFor(provider, { upstreamTiming: timing.timing, meta: { returnUpstreamRequest: true } });
			const result = await execute(args);
			expect(mock.calls[0]).toMatchObject({ method: "POST", bodyJson: {
				model: provider.model, state: args.ir.state, questions,
			} });
			expect(mock.calls[0].headers.Authorization).toBe(`Bearer ${provider.id === "perplexity" ? "perplexity-test" : provider.id === "inception" ? "inception-test" : "liquid-test"}`);
			expect(result.ir).toMatchObject({ model: args.ir.model, answers, usage: {
				inputTokens: 120, outputTokens: provider.outputTokens, totalTokens: 120 + provider.outputTokens,
			} });
			expect(result.bill.usage).toMatchObject({ requests: 1, input_tokens: 120, input_text_tokens: 120,
				output_tokens: provider.outputTokens, total_tokens: 120 + provider.outputTokens });
			expect(result.bill.upstream_id).toBe("upstream-test");
			expect(result.timing?.latencyMs).toEqual(expect.any(Number));
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
		} finally { mock.restore(); }
	});
	it("uses BYOK and honors forceGatewayKey", async () => {
		const mock = installFetchMock([{ match: url => url === provider.url,
			response: () => jsonResponse({ answers, usage: { input_tokens: 12, output_tokens: provider.outputTokens } }),
		}]);
		try {
			const args = argsFor(provider, { byokMeta: [{ id: "byok_test", key: "byok-test" }] as ExecutorExecuteArgs["byokMeta"] });
			const result = await execute(args);
			expect(mock.calls[0].headers.Authorization).toBe("Bearer byok-test");
			expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok_test" });
			const forced = await execute({ ...args, meta: { forceGatewayKey: true } });
			expect(forced.keySource).toBe("gateway");
			expect(mock.calls[1].headers.Authorization).not.toBe("Bearer byok-test");
		} finally { mock.restore(); }
	});
	it("preserves rate limits and bills no usage on provider errors", async () => {
		const mock = installFetchMock([{ match: url => url === provider.url,
			response: jsonResponse({ error: { message: "rate limited" } }, { status: 429, headers: { "Retry-After": "1" } }),
		}]);
		try {
			const result = await execute(argsFor(provider));
			expect(result.upstream.status).toBe(429);
			expect(result.upstream.headers.get("Retry-After")).toBe("1");
			expect(result.bill.usage).toBeUndefined();
			expect(result.ir).toBeUndefined();
		} finally { mock.restore(); }
	});
	it.each([
		{ answers, usage: { input_tokens: -1, output_tokens: 0 } },
		{ answers, usage: { input_tokens: "120", output_tokens: 0 } },
		{ answers, usage: { input_tokens: 1.5, output_tokens: 0 } },
		{ answers, usage: { input_tokens: 1, output_tokens: -1 } },
		{ answers, usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 } },
		{ answers, usage: {} },
		{ answers: { defect: answers.defect }, usage: { input_tokens: 120, output_tokens: 0 } },
		{ answers: { ...answers, severity: {} }, usage: { input_tokens: 120, output_tokens: 0 } },
		...[
			{ ...answers, defect: { type: "noul", noul: 2 } },
			{ ...answers, defect: { error: "failed" } },
			{ ...answers, sentiment: { ...answers.sentiment, choice: "unknown" } },
			{ ...answers, sentiment: { ...answers.sentiment, probabilities: { positive: -0.1, negative: 1.1 } } },
			{ ...answers, sentiment: { ...answers.sentiment, probabilities: { positive: 0.1, unknown: 0.9 } } },
			{ ...answers, sentiment: { ...answers.sentiment, probabilities: { positive: 0.1, negative: 0.1 } } },
			{ ...answers, severity: { ...answers.severity, score: 2 } },
			{ ...answers, severity: { ...answers.severity, type: "choice" } },
			{ ...answers, sentiment: { ...answers.sentiment, confidence: 1.1 } },
		].map(invalidAnswers => ({ answers: invalidAnswers, usage: { input_tokens: 120, output_tokens: 0 } })),
	])("rejects malformed success payloads without charging", async payload => {
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse(payload) }]);
		try {
			const result = await execute(argsFor(provider));
			expect(result.upstream.status).toBe(502);
			expect(result.ir).toBeUndefined();
			expect(result.bill.usage).toBeUndefined();
			expect(result.rawResponse).toEqual(payload);
			expect(result.keySource).toBe("gateway");
		} finally { mock.restore(); }
	});
	it.each(["not json", "x".repeat(1024 * 1024 + 1)])("bounds and rejects invalid response bodies", async body => {
		const mock = installFetchMock([{ match: url => url === provider.url, response: new Response(body) }]);
		try {
			expect((await execute(argsFor(provider))).upstream.status).toBe(502);
		} finally { mock.restore(); }
	});
});

describe("Perplexity limits", () => {
	it.each([
		"https://example.com/image.png", "http://example.com/image.png",
		"data:image/gif;base64,dGVzdA==", "data:image/png;base64,", "data:image/png;base64,invalid!",
		"data:image/png,plain-text", null,
	])("rejects unsupported image URLs before fetching: %s", async url => {
		const args = argsFor(providers[2]);
		args.ir.state = ["Classify", { type: "image_url", image_url: { url } }];
		const mock = installFetchMock([]);
		try {
			const result = await resolveProviderExecutor("perplexity", "decisions.make")!(args);
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each(["choice", "score"])("rejects excessive %s criteria before fetching", async type => {
		const provider = providers[2];
		const mock = installFetchMock([]);
		try {
			const args = argsFor(provider);
			args.ir.questions = { excessive: { type, instructions: "Classify", criteria: type === "score"
				? Array.from({ length: 11 }, (_, i) => `Level ${i}`)
				: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`Option ${i}`, null])) } };
			const result = await resolveProviderExecutor(provider.id, "decisions.make")!(args);
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	// Request and answer copied from Perplexity's documented pplx-decider-v1.3 example:
	// https://docs.perplexity.ai/docs/decisions/quickstart#locate-find-text-in-the-content
	const locateState = "The AeroPress arrived with a cracked filter cap. I emailed help@brewco.example on Monday and nobody replied.";
	const locateAnswers = {
		products: { type: "locate", spans: [{ start: 4, end: 13, text: "AeroPress", score: 0.9999301433563232 }] },
		email: { type: "locate", spans: [{ start: 59, end: 78, text: "help@brewco.example", score: 0.999974250793457 }] },
	};
	it("forwards locate questions and returns spans in the map format", async () => {
		const provider = providers[2];
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "perplexity/pplx-decider-v1.3", state: locateState, questions: {
				products: { type: "locate", instructions: "Every product name mentioned in the review." },
				email: { type: "locate", instructions: "email address" },
				defect: { type: "noul", instructions: "Does the review report a defect?" },
			},
		}));
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse({
			model: "pplx-decider-v1.3", answers: { ...locateAnswers, defect: { type: "noul", noul: 0.94 } },
			usage: { input_tokens: 80, output_tokens: 0 },
		}) }]);
		try {
			const result = await resolveProviderExecutor(provider.id, "decisions.make")!(argsFor(provider, { ir, providerModelSlug: "pplx-decider-v1.3" }));
			expect(mock.calls[0].bodyJson).toEqual({ model: "pplx-decider-v1.3", state: locateState, questions: {
				products: { type: "locate", instructions: "Every product name mentioned in the review." },
				email: { type: "locate", instructions: "email address" },
				defect: { type: "noul", instructions: "Does the review report a defect?" },
			} });
			expect(result.upstream.status).toBe(200);
			expect(encodeDecisionsResponse(result.ir as any, ir).answers).toMatchObject(locateAnswers);
			expect(result.bill.usage).toMatchObject({ input_tokens: 80, output_tokens: 0 });
		} finally { mock.restore(); }
	});
	it("returns locate spans in the array format, including an empty match", async () => {
		const provider = providers[2];
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "perplexity/pplx-decider-v1.3", input: locateState, questions: [
				{ type: "locate", name: "email", instructions: "email address" },
				{ type: "locate", instructions: "phone number" },
			],
		}));
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse({
			answers: { question_0: locateAnswers.email, question_1: { type: "locate", spans: [] } },
			usage: { input_tokens: 40, output_tokens: 0 },
		}) }]);
		try {
			const result = await resolveProviderExecutor(provider.id, "decisions.make")!(argsFor(provider, { ir }));
			expect(mock.calls[0].bodyJson.questions).toEqual({
				question_0: { type: "locate", instructions: "email address" },
				question_1: { type: "locate", instructions: "phone number" },
			});
			expect(encodeDecisionsResponse(result.ir as any, ir).answers).toEqual([
				{ type: "locate", name: "email", spans: locateAnswers.email.spans },
				{ type: "locate", name: null, spans: [] },
			]);
		} finally { mock.restore(); }
	});
	it.each([
		{ spans: [{ start: 9, end: 4, text: "x", score: 1 }] },
		{ spans: [{ start: -1, end: 4, text: "x", score: 1 }] },
		{ spans: [{ start: 0, end: 4, score: 1 }] },
		{ spans: [{ start: 0, end: 4, text: "x", score: "high" }] },
		{ spans: null },
		{ noul: 0.5 },
		{ spans: [{ start: 0, end: 500, text: "invented", score: 1 }] },
		{ spans: [{ start: 4, end: 13, text: "French Press", score: 1 }] },
	])("rejects a malformed locate answer as an invalid provider response: %j", async answer => {
		const provider = providers[2];
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse({
			answers: { email: { type: "locate", ...answer } }, usage: { input_tokens: 10, output_tokens: 0 },
		}) }]);
		try {
			const args = argsFor(provider);
			args.ir.state = locateState;
			args.ir.questions = { email: { type: "locate", instructions: "email address" } };
			expect((await resolveProviderExecutor(provider.id, "decisions.make")!(args)).upstream.status).toBe(502);
		} finally { mock.restore(); }
	});
	it("counts locate offsets in Unicode code points, not UTF-16 units", async () => {
		const provider = providers[2];
		// "👍" is one code point but two UTF-16 units, so "Mail" starts at code point 2.
		const state = "👍 Mail help@brewco.example";
		const mock = installFetchMock([{ match: url => url === provider.url, response: jsonResponse({
			answers: { email: { type: "locate", spans: [{ start: 7, end: 26, text: "help@brewco.example", score: 0.99 }] } },
			usage: { input_tokens: 10, output_tokens: 0 },
		}) }]);
		try {
			const args = argsFor(provider);
			args.ir.state = state;
			args.ir.questions = { email: { type: "locate", instructions: "email address" } };
			expect((await resolveProviderExecutor(provider.id, "decisions.make")!(args)).upstream.status).toBe(200);
		} finally { mock.restore(); }
	});
	it("rejects locate with non-string state before fetching", async () => {
		const mock = installFetchMock([]);
		try {
			const args = argsFor(providers[2]);
			args.ir.questions = { email: { type: "locate", instructions: "email address" } };
			const result = await resolveProviderExecutor("perplexity", "decisions.make")!(args);
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each(["png", "jpeg", "webp"])("forwards %s image state and pinned provider model unchanged", async format => {
		const provider = providers[2];
		const state = ["What color?", { type: "image_url", image_url: { url: `data:image/${format};base64,eA==` } }];
		const mock = installFetchMock([{ match: url => url === provider.url,
			response: jsonResponse({ answers, usage: { input_tokens: 123, output_tokens: 3 } }),
		}]);
		try {
			const args = argsFor(provider, { providerModelSlug: "decider-27b-v0" });
			args.ir.state = state;
			await resolveProviderExecutor(provider.id, "decisions.make")!(args);
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "decider-27b-v0", state });
		} finally { mock.restore(); }
	});
});
