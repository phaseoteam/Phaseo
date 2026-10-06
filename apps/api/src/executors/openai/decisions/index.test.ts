import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const questions = {
	damaged: { type: "noul", instructions: "Is it damaged?" },
	category: { type: "choice", instructions: "Choose", criteria: { billing: "Payments", other: null } },
	severity: { type: "score", instructions: "Rate", criteria: ["Low", "High"] },
};
const answers = [
	{ type: "predicate", name: "damaged", probability: 0.8 },
	{ type: "choice", name: "category", choice: "billing", confidence: 0.6,
		probabilities: [{ value: "billing", probability: 0.8 }, { value: "other", probability: 0.2 }] },
	{ type: "score", name: "severity", score: 0.8, confidence: 0.6,
		probabilities: [{ value: 0, label: "Low", probability: 0.2 }, { value: 1, label: "High", probability: 0.8 }] },
];
function payload() {
	return { model: "gpt-6-luna", answers: structuredClone(answers),
		usage: { input_tokens: 100, output_tokens: 2, total_tokens: 102,
			input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 } } };
}
function argsFor(): ExecutorExecuteArgs {
	return {
		ir: decodeDecisionsRequest(DecisionsSchema.parse({ model: "openai/gpt-6-luna", state: "Complaint", questions })),
		requestId: "req_luna", workspaceId: "test", providerId: "openai", providerModelSlug: "gpt-6-luna",
		endpoint: "decisions", protocol: "phaseo.decisions", capability: "decisions.make",
		byokMeta: [], pricingCard: { rules: [] }, meta: { returnUpstreamRequest: true },
	};
}
const execute = resolveProviderExecutor("openai", "decisions.make")!;
beforeEach(() => setupRuntimeFromEnv({ OPENAI_API_KEY: "openai-test" }));
afterEach(teardownTestRuntime);

describe("OpenAI Luna decisions", () => {
	it("forwards native evidence, safety identifiers and typed choices without changing the wire shape", async () => {
		const input = [{ role: "user", type: "message", content: Array(128).fill({ type: "input_image", image_url: "data:image/png;base64,AQID", detail: "original" }) }];
		const questions = [{ type: "choice", instructions: "Choose", choices: [{ value: true }, { value: "true" }] }];
		const answers = [{ type: "choice", name: null, choice: true, confidence: 0.8, probabilities: [{ value: true, probability: 0.9 }, { value: "true", probability: 0.1 }] }];
		const response = { model: "gpt-6-luna", answers, usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100,
			input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(response) }]);
		try {
			const args = argsFor();
			args.ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "openai/gpt-6-luna", input, questions, safety_identifier: "user-1" }));
			const result = await execute(args);
			expect(mock.calls[0].bodyJson).toEqual({ model: "gpt-6-luna", input, questions, safety_identifier: "user-1" });
			expect(encodeDecisionsResponse(result.ir as any, args.ir)).toEqual({ ...response, model: "openai/gpt-6-luna" });
		} finally { mock.restore(); }
	});
	it("maps all question types and preserves Phaseo answers and aggregate usage", async () => {
		const mock = installFetchMock([{ match: url => url === "https://api.openai.com/v1/decisions", response: jsonResponse(payload()) }]);
		try {
			const result = await execute(argsFor());
			expect(mock.calls[0].headers.Authorization).toBe("Bearer openai-test");
			expect(mock.calls[0].bodyJson).toEqual({ model: "gpt-6-luna", input: "Complaint", questions: [
				{ type: "predicate", name: "damaged", instructions: "Is it damaged?" },
				{ type: "choice", name: "category", instructions: "Choose", choices: [{ value: "billing", description: "Payments" }, { value: "other" }] },
				{ type: "score", name: "severity", instructions: "Rate", levels: [{ label: "Low" }, { label: "High" }] },
			] });
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
			expect(encodeDecisionsResponse(result.ir as any)).toEqual({
				model: "openai/gpt-6-luna", answers: {
					damaged: { type: "noul", noul: 0.8 },
					category: { type: "choice", choice: "billing", probabilities: { billing: 0.8, other: 0.2 }, confidence: 0.6 },
					severity: { type: "score", score: 0.8, probabilities: { "0": 0.2, "1": 0.8 }, legend: { "0": "Low", "1": "High" }, confidence: 0.6 },
				}, usage: { input_tokens: 100, output_tokens: 2, total_tokens: 102 },
			});
			expect(result.bill.usage).toEqual({ requests: 1, input_tokens: 100, output_tokens: 2, total_tokens: 102 });
			const card: PriceCard = {
				provider: "openai", model: "openai/gpt-6-luna", endpoint: "decisions.make",
				currency: "USD", effective_from: null, effective_to: null, version: "1",
				rules: ["input_tokens", "output_tokens"].map(meter => ({
					meter: meter as "input_tokens" | "output_tokens", pricing_plan: "standard", unit: "token", unit_size: 1000000,
					price_per_unit: meter === "input_tokens" ? "0.10" : "0", currency: "USD", match: [], priority: 100,
				})),
			};
			expect(computeBillSummary(result.bill.usage!, card).cost_usd).toBeCloseTo(0.00001);
		} finally { mock.restore(); }
	});
	it("serializes structured state and instructions, carries predicate criteria and embedded images", async () => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(payload()) }]);
		try {
			const args = argsFor();
			args.ir.state = { complaint: "Refund" };
			args.ir.questions.damaged.instructions = { task: "Check" };
			args.ir.questions.damaged.criteria = { true: "Visible dent", false: "Intact" };
			args.ir.images = ["data:image/png;base64,AQID", { content_type: "image/webp", base64: "AQID" }];
			await execute(args);
			expect(mock.calls[0].bodyJson.input).toEqual([{ role: "user", content: [
				{ type: "input_text", text: '{"complaint":"Refund"}' },
				{ type: "input_image", image_url: "data:image/png;base64,AQID" },
				{ type: "input_image", image_url: "data:image/webp;base64,AQID" },
			] }]);
			expect(mock.calls[0].bodyJson.questions[0].instructions).toContain("Visible dent");
		} finally { mock.restore(); }
	});
	it.each([[272000, 0.0272], [272001, 0.0544002]])("applies input-only long-context pricing at %i tokens", (inputTokens, expectedCost) => {
		const card: PriceCard = {
			provider: "openai", model: "openai/gpt-6-luna", endpoint: "decisions.make",
			currency: "USD", effective_from: null, effective_to: null, version: "1",
			rules: [
				{ meter: "input_tokens", pricing_plan: "standard", unit: "token", unit_size: 1000000, price_per_unit: "0.10",
					currency: "USD", match: [{ path: "input_tokens", op: "lte", value: 272000 }], priority: 100 },
				{ meter: "input_tokens", pricing_plan: "standard", unit: "token", unit_size: 1000000, price_per_unit: "0.20",
					currency: "USD", match: [{ path: "input_tokens", op: "gt", value: 272000 }], priority: 100 },
				...(["output_tokens", "cached_read_text_tokens", "cached_write_text_tokens"] as const).map(meter => ({
					meter, pricing_plan: "standard", unit: "token", unit_size: 1000000, price_per_unit: "0",
					currency: "USD", match: [], priority: 100,
				})),
			],
		};
		const bill = computeBillSummary({
			input_tokens: inputTokens, output_tokens: 50,
			input_tokens_details: { cached_tokens: 20, cache_creation_input_tokens: 10 },
		}, card);
		expect(bill.cost_usd).toBeCloseTo(expectedCost, 9);
	});
	it("preserves per-question refusals without inventing scores", async () => {
		const response = payload(); response.answers[0] = { type: "refusal", name: "damaged" } as any;
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(response) }]);
		try {
			expect(await execute(argsFor())).toMatchObject({ ir: { answers: { damaged: { type: "refusal" } } } });
		} finally { mock.restore(); }
	});
	it("uses BYOK and honors forced managed credentials", async () => {
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse(payload()) }]);
		try {
			const args = argsFor(); args.byokMeta = [{ id: "byok-test", key: "byok-key" }] as any;
			expect(await execute(args)).toMatchObject({ keySource: "byok", byokKeyId: "byok-test" });
			expect(mock.calls[0].headers.Authorization).toBe("Bearer byok-key");
			await execute({ ...args, meta: { forceGatewayKey: true } });
			expect(mock.calls[1].headers.Authorization).toBe("Bearer openai-test");
		} finally { mock.restore(); }
	});
	it.each([
		{ providerModelSlug: "chat-latest" },
		{ providerId: "azure" },
		{ images: ["https://example.com/image.png"] },
		{ rawRequest: { stream: true } },
		{ rawRequest: { service_tier: "fast" } },
	])("rejects unsupported routes and controls before fetching: %j", async override => {
		const mock = installFetchMock([]);
		try {
			const args = argsFor();
			if ("providerId" in override || "providerModelSlug" in override) Object.assign(args, override);
			else Object.assign(args.ir, override);
			expect(await execute(args)).toMatchObject({ terminal: true, localClientError: true, upstream: { status: 400 } });
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each([
		(value: any) => { value.answers[0].name = "wrong"; },
		(value: any) => { value.answers[0].probability = 2; },
		(value: any) => { value.answers.pop(); },
		(value: any) => { value.answers[1].choice = true; },
		(value: any) => { value.answers[1].probabilities[1].value = "billing"; },
		(value: any) => { value.answers[1].probabilities[1].probability = 0.6; },
		(value: any) => { value.answers[2].score = 0; },
		(value: any) => { value.answers[2].probabilities[0].label = "wrong"; },
		(value: any) => { value.usage.input_tokens = -1; },
		(value: any) => { value.usage.output_tokens = 0.5; },
		(value: any) => { delete value.usage; },
	])("rejects malformed answers and usage", async mutate => {
		const response = payload(); mutate(response);
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(response) }]);
		try { expect((await execute(argsFor())).upstream.status).toBe(502); } finally { mock.restore(); }
	});
	it("preserves upstream errors and retry headers without usage", async () => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ error: "rate_limit" }, { status: 429, headers: { "Retry-After": "2" } }) }]);
		try {
			const result = await execute(argsFor());
			expect(result.upstream.status).toBe(429);
			expect(result.upstream.headers.get("Retry-After")).toBe("2");
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("bounds upstream response buffering", async () => {
		const mock = installFetchMock([{ match: () => true, response: new Response(" ".repeat(1024 * 1024 + 1)) }]);
		try { expect((await execute(argsFor())).upstream.status).toBe(502); } finally { mock.restore(); }
	});
});
