import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const card: PriceCard = {
	provider: "inception", model: "inception/mercury-decide", endpoint: "decisions.make",
	currency: "USD", version: 2, effective_from: null, effective_to: null,
	rules: [
		{ meter: "input_tokens", price_per_unit: "0.02" },
		{ meter: "output_tokens", price_per_unit: "0" },
	].map(rule => ({ ...rule, unit: "token", unit_size: 1_000_000, currency: "USD", pricing_plan: "standard", match: [], priority: 100 })),
};
function argsFor(overrides: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "inception/mercury-decide", state: { message: "Duplicate charge" },
			questions: { billing: { type: "noul", instructions: "Billing?" } }, ...overrides },
		requestId: "req_mercury", workspaceId: "ws_test", providerId: "inception",
		providerModelSlug: "mercury-decide", endpoint: "decisions", protocol: "phaseo.decisions",
		capability: "decisions.make", byokMeta: [], pricingCard: card, meta: {},
	};
}
beforeEach(() => setupRuntimeFromEnv({ INCEPTION_API_KEY: "inception-test" }));
afterEach(teardownTestRuntime);

describe("Mercury Decide", () => {
	it("preserves the upstream model_not_found response without charging", async () => {
		const error = { error: { code: "model_not_found", type: "invalid_request_error", message: "Decision model not found." } };
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(error, { status: 404 }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(404);
			expect(await result.upstream.json()).toEqual(error);
			expect(result.ir).toBeUndefined();
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("bills actual input at the promotional rate while reporting free output", async () => {
		const mock = installFetchMock([{ match: url => url === "https://api.inceptionlabs.ai/v1/decisions",
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.97 } }, usage: { input_tokens: 120, output_tokens: 3 } }),
		}]);
		try {
			const result = await executor(argsFor());
			const bill = computeBillSummary(result.bill.usage!, card, {}, "standard");
			expect(bill.cost_usd_str).toBe("0.000002400");
			expect(result.bill.usage).toMatchObject({ input_tokens: 120, output_tokens: 3, total_tokens: 123 });
		} finally { mock.restore(); }
	});
	it.each([
		{ rawRequest: { stream: true } },
		{ rawRequest: { tools: [] } },
		{ rawRequest: { tool_choice: "auto" } },
		{ rawRequest: { safety_identifier: "user_test" } },
		{ images: ["data:image/png;base64,eA=="] },
		{ state: ["Inspect", { type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] },
		{ questions: { excessive: { type: "choice", instructions: "Choose", criteria: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [String(i), null])) } } },
		{ questions: { excessive: { type: "score", instructions: "Score", criteria: Array.from({ length: 11 }, (_, i) => String(i)) } } },
	] satisfies Partial<IRDecisionsRequest>[])("rejects unsupported requests before contacting Inception", async overrides => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(argsFor(overrides));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(result.bill.usage).toBeUndefined();
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("honors the configured endpoint and pinned upstream model", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ INCEPTION_API_KEY: "inception-test", INCEPTION_BASE_URL: "https://inception.example" });
		const mock = installFetchMock([{ match: url => url === "https://inception.example/v1/decisions",
			response: jsonResponse({ answers: { billing: { type: "noul", noul: 0.97 } }, usage: { input_tokens: 120, output_tokens: 1 } }),
		}]);
		try {
			await executor({ ...argsFor(), providerModelSlug: "mercury-decide-pinned" });
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "mercury-decide-pinned" });
		} finally { mock.restore(); }
	});
});
