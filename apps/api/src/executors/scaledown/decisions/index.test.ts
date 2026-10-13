import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const card: PriceCard = {
	provider: "scaledown", model: "scaledown/classify-1", endpoint: "decisions.make",
	currency: "USD", version: 1, effective_from: null, effective_to: null,
	rules: [
		{ meter: "input_tokens", price_per_unit: "0.05" },
		{ meter: "output_tokens", price_per_unit: "0" },
	].map(rule => ({ ...rule, unit: "token", unit_size: 1_000_000, currency: "USD", pricing_plan: "standard", match: [], priority: 100 })),
};
function argsFor(overrides: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "scaledown/classify-1", state: "I was charged twice for my subscription this month.",
			questions: { category: { type: "choice", instructions: "Which team should handle this?",
				criteria: { billing: "A charge or refund.", technical: null } } }, ...overrides },
		requestId: "req_scaledown", workspaceId: "ws_test", providerId: "scaledown",
		providerModelSlug: "classify-1", endpoint: "decisions", protocol: "phaseo.decisions",
		capability: "decisions.make", byokMeta: [], pricingCard: card, meta: {},
	};
}
beforeEach(() => setupRuntimeFromEnv({ SCALEDOWN_API_KEY: "scaledown-test" }));
afterEach(teardownTestRuntime);

describe("ScaleDown Classify-1", () => {
	it("sends Jev-shaped questions with the x-api-key header and bills input tokens", async () => {
		const mock = installFetchMock([{ match: url => url === "https://api.scaledown.xyz/v1/scaledown",
			response: jsonResponse({ model: "classify-1",
				answers: { category: { type: "choice", choice: "billing", probabilities: { billing: 0.94, technical: 0.06 }, confidence: 0.94 } },
				usage: { input_tokens: 62, output_tokens: 1, cost: 0.0000026 } }),
		}]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(200);
			const headers = new Headers(mock.calls[0].headers);
			expect(headers.get("x-api-key")).toBe("scaledown-test");
			expect(headers.get("authorization")).toBeNull();
			expect(mock.calls[0].bodyJson).toEqual({ model: "classify-1", state: "I was charged twice for my subscription this month.",
				questions: { category: { type: "choice", instructions: "Which team should handle this?",
					criteria: { billing: "A charge or refund.", technical: "technical" } } } });
			expect(result.bill.usage).toMatchObject({ input_tokens: 62, output_tokens: 1, total_tokens: 63 });
			expect(computeBillSummary(result.bill.usage!, card, {}, "standard").cost_usd_str).toBe("0.000003100");
		} finally { mock.restore(); }
	});
	it("drops noul criteria and stringifies structured instructions", async () => {
		const mock = installFetchMock([{ match: () => true,
			response: jsonResponse({ answers: { urgent: { type: "noul", noul: 0.8 } }, usage: { input_tokens: 20, output_tokens: 1 } }) }]);
		try {
			await executor(argsFor({ questions: { urgent: { type: "noul", instructions: { ask: "Is it urgent?" }, criteria: { true: "Yes" } } } }));
			expect(mock.calls[0].bodyJson.questions).toEqual({ urgent: { type: "noul", instructions: "{\"ask\":\"Is it urgent?\"}" } });
		} finally { mock.restore(); }
	});
	it.each([
		{ images: ["data:image/png;base64,eA=="] },
		{ questions: { one: { type: "choice", instructions: "Pick", criteria: { only: "One option" } } } },
		{ questions: { many: { type: "choice", instructions: "Pick", criteria: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`o${i}`, null])) } } },
		{ questions: { scale: { type: "score", instructions: "Rate", criteria: ["low", "mid", "high", "a", "b", "c", "d", "e", "f", "g", "h"] } } },
	] as Partial<IRDecisionsRequest>[])("rejects unsupported input locally: %o", async overrides => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({}) }]);
		try {
			const result = await executor(argsFor(overrides));
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("returns a 502 when answers do not match the questions", async () => {
		const mock = installFetchMock([{ match: () => true,
			response: jsonResponse({ answers: {}, usage: { input_tokens: 5, output_tokens: 0 } }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(502);
		} finally { mock.restore(); }
	});
});
