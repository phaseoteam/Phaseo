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

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function buildArgs(ir: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "morph/reflex",
			state: "Ticket: the package arrived crushed.",
			questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
			...ir,
		},
		requestId: "req_morph_reflex_test",
		workspaceId: "team_test",
		providerId: "morph",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "reflex",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
	} as unknown as ExecutorExecuteArgs;
}

const reflexResponse = (usage: Record<string, unknown>) => jsonResponse({
	model: "reflex",
	answers: { urgent: { type: "noul", noul: 0.91, confidence: 0.82 } },
	usage,
});

beforeEach(() => setupRuntimeFromEnv({ MORPH_API_KEY: "morph-test-key" } as any));
afterEach(teardownTestRuntime);

describe("Morph Reflex decisions executor", () => {
	it("posts state, questions and inline images to /v1/systemone", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.morphllm.com/v1/systemone",
			response: reflexResponse({ input_tokens: 120, output_tokens: 0 }),
		}]);
		try {
			const result = await executor(buildArgs({ images: [PNG, { content_type: "image/jpeg", base64: "/9j/4AAQ" }] }));
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer morph-test-key");
			expect(mock.calls[0]?.bodyJson).toEqual({
				model: "reflex",
				state: "Ticket: the package arrived crushed.",
				questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
				images: [PNG, "data:image/jpeg;base64,/9j/4AAQ"],
			});
			expect(result.kind).toBe("completed");
			expect(result.bill.usage).toMatchObject({ requests: 1, input_tokens: 120, input_text_tokens: 120, output_tokens: 0 });
		} finally {
			mock.restore();
		}
	});

	it("bills cached input at the cached rate", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.morphllm.com/v1/systemone",
			response: reflexResponse({ input_tokens: 1000, output_tokens: 0, input_tokens_details: { cached_tokens: 800 } }),
		}]);
		try {
			const result = await executor(buildArgs());
			const usage = result.bill.usage as Record<string, any>;
			expect(usage.input_tokens_details).toEqual({ cached_tokens: 800 });
			const card = {
				provider: "morph", model: "morph/reflex", endpoint: "decisions.make", currency: "USD",
				effective_from: null, effective_to: null, version: null,
				rules: [
					{ id: "in", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.042", currency: "USD", match: [], priority: 0 },
					{ id: "cached", pricing_plan: "standard", meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.01", currency: "USD", match: [], priority: 0 },
				],
			} as any;
			// 200 uncached x $0.042/M + 800 cached x $0.01/M = 8,400 + 8,000 nanos.
			expect(calculatePricing(usage, card, { model: "morph/reflex" }).totalNanos).toBe(16_400);
		} finally {
			mock.restore();
		}
	});

	it("keeps the cached split through native-format encoding and usage merge", async () => {
		const native = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "morph/reflex", input: "Ticket: the package arrived crushed.",
			questions: [{ type: "predicate", instructions: "Is this urgent?" }],
		}));
		const mock = installFetchMock([{
			match: (url) => url === "https://api.morphllm.com/v1/systemone",
			response: jsonResponse({
				model: "reflex",
				answers: { question_0: { type: "noul", noul: 0.91, confidence: 0.82 } },
				usage: { input_tokens: 1000, output_tokens: 0, input_tokens_details: { cached_tokens: 800 } },
			}),
		}]);
		try {
			const result = await executor(buildArgs(native as unknown as Record<string, unknown>));
			const payload = encodeDecisionsResponse(result.ir as any, native);
			expect(payload.usage.input_tokens_details.cached_tokens).toBe(800);
			const merged = mergeBillAndPayloadUsage(result.bill.usage, payload.usage);
			const card = {
				provider: "morph", model: "morph/reflex", endpoint: "decisions.make", currency: "USD",
				effective_from: null, effective_to: null, version: null,
				rules: [
					{ id: "in", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.042", currency: "USD", match: [], priority: 0 },
					{ id: "cached", pricing_plan: "standard", meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.01", currency: "USD", match: [], priority: 0 },
				],
			} as any;
			expect(calculatePricing(merged, card, { model: "morph/reflex" }).totalNanos).toBe(16_400);
		} finally {
			mock.restore();
		}
	});

	it.each([
		["an image of exactly 8,000,000 bytes", 8_000_000, 200],
		["an image one byte over the limit", 8_000_001, 400],
	])("applies Morph's image size limit: %s", async (_label, bytes, status) => {
		const base64 = Buffer.alloc(bytes).toString("base64");
		const mock = installFetchMock([{
			match: (url) => url === "https://api.morphllm.com/v1/systemone",
			response: reflexResponse({ input_tokens: 10, output_tokens: 0 }),
		}]);
		try {
			const result = await executor(buildArgs({ images: [`data:image/png;base64,${base64}`] }));
			expect(result.upstream.status).toBe(status);
		} finally {
			mock.restore();
		}
	});

	it("accepts a choice question with one option", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.morphllm.com/v1/systemone",
			response: jsonResponse({
				model: "reflex",
				answers: { only: { type: "choice", choice: "a", confidence: 1, probabilities: { a: 1 } } },
				usage: { input_tokens: 10, output_tokens: 0 },
			}),
		}]);
		try {
			const result = await executor(buildArgs({ questions: { only: { type: "choice", instructions: "Pick", criteria: { a: "Only option" } } } }));
			expect(mock.calls).toHaveLength(1);
			expect(result.upstream.status).toBe(200);
		} finally {
			mock.restore();
		}
	});

	it.each([
		["remote image URLs", { images: ["https://example.com/a.png"] }],
		["more than 16 images", { images: Array.from({ length: 17 }, () => PNG) }],
		["audio", { audio: [{ type: "audio", data: "AAAA", format: "wav" }] }],
		["box questions", { questions: { where: { type: "box", instructions: "Find the dent." } } }],
		["generation controls", { rawRequest: { temperature: 0.2 } }],
	])("rejects %s locally", async (_label, ir) => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(buildArgs(ir));
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally {
			mock.restore();
		}
	});
});
