import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const card: PriceCard = {
	provider: "baseten", model: "baselabs/elephant-1", endpoint: "decisions.make",
	currency: "USD", version: "2", effective_from: null, effective_to: "2026-10-28T06:59:00Z",
	rules: ["input_tokens", "output_tokens"].map(meter => ({
		meter, price_per_unit: "0", unit: "token", unit_size: 1_000_000,
		currency: "USD", pricing_plan: "standard", match: [], priority: 200,
	})),
};
function argsFor(overrides: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "baselabs/elephant-1", state: { message: "Duplicate charge" },
			questions: { billing: { type: "noul", instructions: "Billing?" } }, ...overrides },
		requestId: "req_baseten", workspaceId: "ws_test", providerId: "baseten",
		providerModelSlug: "decision-models/baseten-elephant-9b-latest", endpoint: "decisions",
		protocol: "phaseo.decisions", capability: "decisions.make", byokMeta: [], pricingCard: card, meta: {},
	};
}
beforeEach(() => setupRuntimeFromEnv({ BASETEN_API_KEY: "baseten-test" }));
afterEach(teardownTestRuntime);

describe("Baseten Decisions", () => {
	it("rejects oversized string state before contacting Baseten", async () => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(argsFor({ state: "x".repeat(50_001) }));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each(["x".repeat(50_000), "😀".repeat(25_001)])("uses code points for the state character boundary", async state => {
		const mock = installFetchMock([{ match: () => true,
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } }),
		}]);
		try {
			expect((await executor(argsFor({ state }))).upstream.status).toBe(200);
			expect(mock.calls).toHaveLength(1);
		} finally { mock.restore(); }
	});
	it.each([
		"State exceeds 50000 characters",
		"OneJev prompt has 25102 tokens, exceeding max_len 16384; prompts are never truncated",
	])("returns upstream input limits as client errors: %s", async error => {
		const mock = installFetchMock([{ match: () => true,
			response: jsonResponse({ error, error_type: "Validation" }, { status: 422 }),
		}]);
		try {
			const result = await executor(argsFor({ state: { text: "large structured input" } }));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "invalid_decision_request", message: error });
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it.each([
		{ error: "Unrecognized model configuration", error_type: "Validation" },
		{ error: "State exceeds 50000 characters", error_type: "Internal" },
		"invalid JSON",
	])("preserves unrelated upstream 422 failures", async payload => {
		const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
		const mock = installFetchMock([{ match: () => true, response: new Response(raw, { status: 422 }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(422);
			expect(await result.upstream.text()).toBe(raw);
			expect(result.localClientError).not.toBe(true);
		} finally { mock.restore(); }
	});
	it("bounds oversized upstream validation errors", async () => {
		const mock = installFetchMock([{ match: () => true, response: new Response("x".repeat(65_537), { status: 422 }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it.each([
		["baselabs/elephant-1", "decision-models/baseten-elephant-9b-latest"],
		["baselabs/mammoth-1", "decision-models/baseten-mammoth-27b-latest"],
	])("maps %s through the Decisions IR and preserves usage", async (model, providerModelSlug) => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model, input: "Duplicate charge", questions: [
			{ type: "predicate", instructions: "Billing?" },
			{ type: "choice", name: "route", instructions: "Which team?", choices: [{ value: "billing" }, { value: "support" }] },
			{ type: "score", instructions: "Urgency?", levels: [{ label: "low" }, { label: "high" }] },
		] }));
		const mock = installFetchMock([{ match: url => url === "https://inference.baseten.co/v1/systemone",
			response: jsonResponse({ model: providerModelSlug, answers: {
				question_0: { type: "noul", noul: 0.98 },
				question_1: { type: "choice", choice: "0", confidence: 0.96, probabilities: { "0": 0.98, "1": 0.02 } },
				question_2: { type: "score", score: 0.25, confidence: 0.5, legend: { "0": "low", "1": "high" }, probabilities: { "0": 0.75, "1": 0.25 } },
			}, usage: { input_tokens: 210, output_tokens: 3 } }),
		}]);
		try {
			const result = await executor({ ...argsFor(), ir, providerModelSlug, meta: { returnUpstreamRequest: true } });
			expect(mock.calls[0].headers.Authorization).toBe("Bearer baseten-test");
			expect(mock.calls[0].bodyJson).toEqual({ model: providerModelSlug, state: ir.state, questions: ir.questions });
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
			const response = encodeDecisionsResponse(result.ir as IRDecisionsResponse, ir);
			expect(response.model).toBe(model);
			expect(response.answers).toEqual([
				{ type: "predicate", name: null, probability: 0.98 },
				{ type: "choice", name: "route", choice: "billing", confidence: 0.96, probabilities: [
					{ value: "billing", probability: 0.98 }, { value: "support", probability: 0.02 },
				] },
				{ type: "score", name: null, score: 0.25, confidence: 0.5, probabilities: [
					{ value: 0, label: "low", probability: 0.75 }, { value: 1, label: "high", probability: 0.25 },
				] },
			]);
			expect(result.bill.usage).toMatchObject({ input_tokens: 210, output_tokens: 3, total_tokens: 213 });
			expect(computeBillSummary(result.bill.usage!, card, {}, "standard").cost_usd_str).toBe("0.000000000");
		} finally { mock.restore(); }
	});
	it.each([
		{ images: ["data:image/png;base64,eA=="] }, { videos: ["https://example.com/video.mp4"] },
		{ audio: [{ type: "audio", source: "url", data: "https://example.com/audio.wav" }] },
		{ rawRequest: { stream: true } }, { rawRequest: { tools: [] } }, { rawRequest: { tool_choice: "auto" } },
		{ rawRequest: { safety_identifier: "user" } }, { rawRequest: { temperature: 0.5 } }, { rawRequest: { service_tier: "fast" } },
		{ providerOptions: { typesafe: { long_context: true } } },
		{ questions: { box: { type: "box", instructions: "Find it" } } },
		{ questions: { score: { type: "score", instructions: "Score", criteria: ["one"] } } },
		{ questions: { score: { type: "score", instructions: "Score", criteria: Array(11).fill("level") } } },
		{ questions: { choice: { type: "choice", instructions: "Choose", criteria: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [String(i), null])) } } },
	] satisfies Partial<IRDecisionsRequest>[])("rejects unsupported requests without fetching: %j", async override => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(argsFor(override));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(result.bill.usage).toBeUndefined();
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("does not substitute an unknown upstream model", async () => {
		const mock = installFetchMock([]);
		try {
			for (const providerModelSlug of [undefined, "unknown"]) {
				expect((await executor({ ...argsFor(), providerModelSlug })).upstream.status).toBe(400);
			}
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("honors BYOK and the configured base URL", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ BASETEN_BASE_URL: "https://baseten.example/v1" });
		const mock = installFetchMock([{ match: url => url === "https://baseten.example/v1/systemone",
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } }),
		}]);
		try {
			const result = await executor({ ...argsFor(), byokMeta: [{ id: "byok_test", key: "byok-key" }] as ExecutorExecuteArgs["byokMeta"] });
			expect(mock.calls[0].headers.Authorization).toBe("Bearer byok-key");
			expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok_test" });
		} finally { mock.restore(); }
	});
	it.each([
		{ answers: {}, usage: { input_tokens: 10, output_tokens: 1 } },
		{ answers: { billing: { type: "noul", noul: 2 } }, usage: { input_tokens: 10, output_tokens: 1 } },
		{ answers: { billing: { type: "noul", noul: 0.9 } }, usage: { input_tokens: -1, output_tokens: 1 } },
	])("rejects malformed responses without usage billing", async payload => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(payload) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("preserves provider errors without inventing usage", async () => {
		const error = { error: { message: "Rate limited" } };
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(error, { status: 429 }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(429);
			expect(await result.upstream.json()).toEqual(error);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
});
