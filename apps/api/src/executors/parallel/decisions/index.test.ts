import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { calculatePricing } from "@pipeline/after/pricing";
import { mergeBillAndPayloadUsage } from "@pipeline/usage";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const PARALLEL_URL = "https://api.parallel.ai/v1/decisions";

function buildArgs(ir: Record<string, unknown> = {}, overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "parallel/decisions-fast",
			state: { company: "Parallel Web Systems", website: "https://parallel.ai" },
			questions: { has_decisions_api: { type: "noul", instructions: "Does Parallel offer a Decisions API?" } },
			...ir,
		},
		requestId: "req_parallel_decisions_test",
		workspaceId: "team_test",
		providerId: "parallel",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "decisions-fast",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as unknown as ExecutorExecuteArgs;
}

// A request-priced card: Parallel charges $1 per 1,000 requests and nothing per token.
const requestCard = {
	provider: "parallel", model: "parallel/decisions-fast", endpoint: "decisions.make", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [
		{ id: "req", pricing_plan: "standard", meter: "requests", unit: "request", unit_size: 1, price_per_unit: "0.001", currency: "USD", match: [], priority: 0 },
	],
} as any;

// Captured from a live Parallel Decisions call (fast mode) with one question of each type.
const liveResponse = {
	mode: "fast",
	answers: {
		has_decisions_api: { type: "noul", noul: 0.9884691876217812 },
		api_kind: {
			type: "choice", choice: "search",
			probabilities: { search: 0.9919290079401355, chat: 0.006836601932822444, hardware: 0.001234390127042059 },
			confidence: 0.9878935119102032,
		},
		fit: {
			type: "score", score: 1.7077749580912234,
			legend: { 0: "Not documented", 1: "Partly documented", 2: "Fully documented with examples" },
			probabilities: { 0: 0.013365212872767958, 1: 0.26549461616324094, 2: 0.7211401709639912 },
			confidence: 0.5616624371368347,
		},
	},
	usage: { input_tokens: 2595, output_tokens: 0 },
	citations: [{ url: "https://docs.parallel.ai/decisions/decisions-quickstart", title: "Decisions API Quickstart - Parallel Docs", excerpts: [] }],
	decision_id: "decisions_89a30028b1f32404e71b6be7035589ec",
};

const mixedQuestions = {
	has_decisions_api: { type: "noul", instructions: "Does Parallel offer a Decisions API?" },
	api_kind: {
		type: "choice", instructions: "Which best describes Parallel's core product?",
		criteria: { search: "A web search API", chat: "A consumer chatbot", hardware: "A hardware company" },
	},
	fit: {
		type: "score", instructions: "How well documented is the Decisions API?",
		criteria: ["Not documented", "Partly documented", "Fully documented with examples"],
	},
};

beforeEach(() => setupRuntimeFromEnv({ PARALLEL_API_KEY: "parallel-test-key" } as any));
afterEach(teardownTestRuntime);

describe("Parallel Decisions executor", () => {
	it("posts state and questions with x-api-key and sends no model", async () => {
		const mock = installFetchMock([{ match: (url) => url === PARALLEL_URL, response: jsonResponse(liveResponse, { headers: { "x-request-id": "par_req_1" } }) }]);
		try {
			const result = await executor(buildArgs({ questions: mixedQuestions }, { meta: { echoUpstreamRequest: true } as any }));
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.method).toBe("POST");
			expect(mock.calls[0]?.headers["x-api-key"]).toBe("parallel-test-key");
			expect(mock.calls[0]?.headers.Authorization).toBeUndefined();
			expect(mock.calls[0]?.bodyJson).toEqual({
				state: { company: "Parallel Web Systems", website: "https://parallel.ai" },
				questions: mixedQuestions,
			});
			expect(result.kind).toBe("completed");
			expect((result as any).mappedRequest).toBe(JSON.stringify(mock.calls[0]?.bodyJson));
			expect(result.ir).toMatchObject({
				model: "parallel/decisions-fast",
				answers: liveResponse.answers,
				usage: { inputTokens: 2595, outputTokens: 0, totalTokens: 2595 },
			});
			expect(result.bill).toMatchObject({ upstream_id: "par_req_1", usage: { requests: 1, input_tokens: 2595, output_tokens: 0 } });
		} finally {
			mock.restore();
		}
	});

	it("bills $0.001 per request whatever the token count", async () => {
		const mock = installFetchMock([{ match: (url) => url === PARALLEL_URL, response: jsonResponse(liveResponse) }]);
		try {
			const result = await executor(buildArgs({ questions: mixedQuestions }));
			// $0.001 = 1,000,000 nanos; the 2,595 input tokens have no rule and add nothing.
			expect(calculatePricing(result.bill.usage as any, requestCard, { model: "parallel/decisions-fast" }).totalNanos).toBe(1_000_000);
		} finally {
			mock.restore();
		}
	});

	it("keeps one request charge through native-format encoding and usage merge", async () => {
		const native = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "parallel/decisions-fast", input: "Parallel Web Systems, https://parallel.ai",
			questions: [
				{ type: "predicate", instructions: "Does Parallel offer a Decisions API?" },
				{ type: "choice", instructions: "Which best describes Parallel's core product?", choices: [{ value: "search" }, { value: "chat" }] },
			],
		}));
		const mock = installFetchMock([{
			match: (url) => url === PARALLEL_URL,
			response: jsonResponse({
				mode: "fast",
				answers: {
					question_0: { type: "noul", noul: 0.98 },
					question_1: { type: "choice", choice: "0", probabilities: { 0: 0.99, 1: 0.01 }, confidence: 0.97 },
				},
				usage: { input_tokens: 900, output_tokens: 0 },
				citations: [],
			}),
		}]);
		try {
			const result = await executor(buildArgs(native as unknown as Record<string, unknown>));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ questions: { question_0: { type: "noul" }, question_1: { type: "choice", criteria: { 0: "search", 1: "chat" } } } });
			const payload = encodeDecisionsResponse(result.ir as any, native);
			expect(payload.answers[0]).toMatchObject({ type: "predicate", probability: 0.98 });
			expect(payload.answers[1]).toMatchObject({ type: "choice", choice: "search", confidence: 0.97 });
			const merged = mergeBillAndPayloadUsage(result.bill.usage, payload.usage);
			expect(calculatePricing(merged, requestCard, { model: "parallel/decisions-fast" }).totalNanos).toBe(1_000_000);
		} finally {
			mock.restore();
		}
	});

	it("keeps the other answers when Parallel refuses one question", async () => {
		const mock = installFetchMock([{
			match: (url) => url === PARALLEL_URL,
			response: jsonResponse({
				mode: "fast",
				answers: { has_decisions_api: { type: "noul", noul: 0.9 }, second: { type: "refusal" } },
				usage: { input_tokens: 100, output_tokens: 0 },
				citations: [],
			}),
		}]);
		try {
			const result = await executor(buildArgs({ questions: {
				has_decisions_api: { type: "noul", instructions: "Does Parallel offer a Decisions API?" },
				second: { type: "noul", instructions: "Another question?" },
			} }));
			expect(result.upstream.status).toBe(200);
			expect((result.ir as any).answers).toEqual({ has_decisions_api: { type: "noul", noul: 0.9 }, second: { type: "refusal" } });
		} finally {
			mock.restore();
		}
	});

	it("returns 502 for a malformed answer that is not a refusal", async () => {
		const mock = installFetchMock([{
			match: (url) => url === PARALLEL_URL,
			response: jsonResponse({ mode: "fast", answers: { has_decisions_api: { type: "noul", noul: 4 } }, usage: { input_tokens: 1, output_tokens: 0 } }),
		}]);
		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it("passes upstream errors through without billing", async () => {
		const mock = installFetchMock([{
			match: (url) => url === PARALLEL_URL,
			response: jsonResponse({ type: "error", error: { ref_id: "ref_1", message: "Request validation error" } }, { status: 422 }),
		}]);
		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(422);
			expect(result.bill.usage).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it("uses PARALLEL_BASE_URL when set", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ PARALLEL_API_KEY: "parallel-test-key", PARALLEL_BASE_URL: "https://parallel.example.test/" } as any);
		const mock = installFetchMock([{ match: (url) => url === "https://parallel.example.test/v1/decisions", response: jsonResponse(liveResponse) }]);
		try {
			const result = await executor(buildArgs({ questions: mixedQuestions }));
			expect(mock.calls).toHaveLength(1);
			expect(result.upstream.status).toBe(200);
		} finally {
			mock.restore();
		}
	});

	const manyQuestions = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`q${i}`, { type: "noul", instructions: "Q?" }]));
	it.each([
		["images", { images: ["data:image/png;base64,iVBORw0KGgo="] }],
		["audio", { audio: [{ type: "audio", data: "AAAA", format: "wav" }] }],
		["video", { videos: ["https://example.com/a.mp4"] }],
		["box questions", { questions: { where: { type: "box", instructions: "Find the dent." } } }],
		["a choice question with one option", { questions: { only: { type: "choice", instructions: "Pick", criteria: { a: "Only" } } } }],
		["a score question with one level", { questions: { s: { type: "score", instructions: "Rate", criteria: ["Only"] } } }],
		["a score question with 11 levels", { questions: { s: { type: "score", instructions: "Rate", criteria: Array.from({ length: 11 }, (_, i) => `L${i}`) } } }],
		["a question name with spaces", { questions: { "bad name": { type: "noul", instructions: "Q?" } } }],
		["101 questions", { questions: manyQuestions }],
		["no questions", { questions: {} }],
		["non-string instructions", { questions: { q: { type: "noul", instructions: { text: "Q?" } } } }],
		["generation controls", { rawRequest: { temperature: 0.2 } }],
		["streaming", { rawRequest: { stream: true } }],
		["provider options", { providerOptions: { typesafe: { long_context: true } } }],
	])("rejects %s locally without calling Parallel", async (_label, ir) => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(liveResponse) }]);
		try {
			const result = await executor(buildArgs(ir));
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
			await expect(result.upstream.json()).resolves.toMatchObject({ error: "unsupported_decision_request" });
			expect(result.bill.usage).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it("sends only documented question fields", async () => {
		const mock = installFetchMock([{ match: (url) => url === PARALLEL_URL, response: jsonResponse({
			mode: "fast", answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 5, output_tokens: 0 }, citations: [],
		}) }]);
		try {
			await executor(buildArgs({ questions: { q: { type: "noul", instructions: "Q?", criteria: { true: "Yes", false: "No" }, extra: "x" } } }));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ questions: { q: { type: "noul", instructions: "Q?", criteria: { true: "Yes", false: "No" } } } });
			expect((mock.calls[0]?.bodyJson as any).questions.q.extra).toBeUndefined();
		} finally {
			mock.restore();
		}
	});
});
