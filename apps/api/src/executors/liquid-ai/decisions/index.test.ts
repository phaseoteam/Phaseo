import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRDecisionsRequest } from "@core/ir";
import { resolveProviderExecutor } from "@executors/index";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { filterDecisionCandidatesByModalities } from "@pipeline/execute/modalities";
import type { ProviderCandidate } from "@pipeline/before/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const URL = "https://api.liquid.ai/decisions/v1/systemone";
const WAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const execute = resolveProviderExecutor("liquid-ai", "decisions.make")!;

function argsFor(ir: IRDecisionsRequest): ExecutorExecuteArgs {
	return {
		ir, requestId: "req_liquid_test", workspaceId: "team_test", providerId: "liquid-ai",
		endpoint: "decisions", protocol: "phaseo.decisions", capability: "decisions.make",
		providerModelSlug: "d1.2", byokMeta: [], pricingCard: { rules: [] }, meta: {},
	};
}
function legacy(body: Record<string, unknown>): IRDecisionsRequest {
	return decodeDecisionsRequest(DecisionsSchema.parse({ model: "liquid-ai/d1.2", state: "Evidence", ...body }));
}
async function run(ir: IRDecisionsRequest, answers: Record<string, unknown>) {
	const mock = installFetchMock([{ match: url => url === URL,
		response: jsonResponse({ model: "d1.2", answers, usage: { input_tokens: 40, output_tokens: 0 } }) }]);
	try {
		const result = await execute(argsFor(ir));
		return { result, body: mock.calls[0]?.bodyJson as Record<string, any> };
	} finally { mock.restore(); }
}

beforeEach(() => setupRuntimeFromEnv({ LIQUID_AI_API_KEY: "liquid-test" }));
afterEach(teardownTestRuntime);

describe("Liquid decisions media", () => {
	it("forwards images and audio clips as data URLs and bills them as non-text input", async () => {
		const ir = legacy({ images: [PNG], audio: [`data:audio/wav;base64,${WAV}`],
			questions: { siren: { type: "noul", instructions: "Is there a siren?" } } });
		expect(ir.audio).toEqual([{ type: "audio", source: "data", data: WAV, format: "wav" }]);
		const { result, body } = await run(ir, { siren: { type: "noul", noul: 0.8 } });
		expect(body).toMatchObject({ model: "d1.2", state: "Evidence", images: [PNG], audio: [`data:audio/wav;base64,${WAV}`] });
		expect(result.upstream.status).toBe(200);
		expect(result.bill.usage).toMatchObject({ input_tokens: 40 });
		expect(result.bill.usage).not.toHaveProperty("input_text_tokens");
	});
	it("forwards native input_audio parts", async () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "liquid-ai/d1.2", input: [{ role: "user", content: [
			{ type: "input_audio", input_audio: { data: WAV, format: "mp3" } }, { type: "input_text", text: "Which language?" },
		] }], questions: [{ type: "predicate", instructions: "Is it Spanish?" }] }));
		const { result, body } = await run(ir, { question_0: { type: "noul", noul: 0.3 } });
		expect(body.audio).toEqual([`data:audio/mpeg;base64,${WAV}`]);
		expect(encodeDecisionsResponse(result.ir as any, ir).answers).toEqual([{ type: "predicate", name: null, probability: 0.3 }]);
	});
	it("sends no media fields on text-only requests", async () => {
		const { body } = await run(legacy({ questions: { q: { type: "noul", instructions: "Refund?" } } }), { q: { type: "noul", noul: 0.5 } });
		expect(body).not.toHaveProperty("images");
		expect(body).not.toHaveProperty("audio");
	});
});

// Answer shapes from https://docs.liquid.ai/lfm/models/decision-models.md#typed-answers
const typedQuestions = {
	payee: { type: "text", instructions: "Who issued the invoice?" },
	total: { type: "number", instructions: "How much is due?", unit: "EUR" },
	due: { type: "date", instructions: "By when must it be paid?" },
	vat: { type: "number", instructions: "How much VAT is charged?" },
	people: { type: "number", instructions: "How many people?", range: [0, 20], step: 1 },
	pii: { type: "spans", instructions: "Every piece of personal data." },
	topics: { type: "choice", multiple: true, instructions: "Which topics?", criteria: { billing: "Payments", delivery: "Shipping", login: null } },
};
const typedAnswers = {
	payee: { type: "text", text: "ACME SA", span: [0, 7], found: 0.99 },
	total: { type: "number", number: 1234.5, unit: "EUR", text: "1 234,50 EUR", span: [40, 52], found: 0.98 },
	due: { type: "date", date: "2026-04-03", text: "03/04/2026", span: [64, 74], found: 0.97 },
	vat: { type: "number", number: null, unit: null, text: null, span: null, found: 0.02 },
	people: { type: "number", number: 12, interval: [10, 14] },
	pii: { type: "spans", spans: [{ text: "ACME SA", span: [0, 7], found: 0.9 }] },
	topics: { type: "choice", choices: ["billing", "delivery"], probabilities: { billing: 0.9, delivery: 0.7, login: 0.05 } },
};

describe("Liquid typed answers", () => {
	it("passes typed questions through and returns the documented answers unchanged", async () => {
		const ir = legacy({ questions: typedQuestions });
		const { result, body } = await run(ir, typedAnswers);
		expect(body.questions).toEqual(typedQuestions);
		expect(result.upstream.status).toBe(200);
		expect(encodeDecisionsResponse(result.ir as any, ir).answers).toEqual(typedAnswers);
	});
	it("accepts boxes and a box that is not found", async () => {
		const ir = legacy({ images: [PNG], questions: {
			signature: { type: "box", instructions: "Where is the signature?" },
			trees: { type: "boxes", instructions: "Every tree.", max: 4 },
		} });
		const { result } = await run(ir, {
			signature: { type: "box", box: null, found: 0.1, confidence: 0.1 },
			trees: { type: "boxes", count: 1, at_least: false, boxes: [
				{ box: { top: 0.1, bottom: 0.4, left: 0.2, right: 0.3 }, found: 0.9, confidence: 0.9 },
			] },
		});
		expect(result.upstream.status).toBe(200);
	});
	it.each([
		{ payee: { ...typedAnswers.payee, text: 7 } },
		{ total: { ...typedAnswers.total, number: "1234.5" } },
		{ due: { ...typedAnswers.due, found: 2 } },
		{ people: { type: "number", number: 12 } },
		{ people: { type: "number", number: 12, interval: [14, 10] } },
		{ pii: { type: "spans", spans: "ACME" } },
		{ topics: { ...typedAnswers.topics, choices: ["refunds"] } },
		{ topics: { ...typedAnswers.topics, probabilities: { billing: 0.9 } } },
	])("rejects malformed typed answers without charging: %j", async override => {
		const { result } = await run(legacy({ questions: typedQuestions }), { ...typedAnswers, ...override });
		expect(result.upstream.status).toBe(502);
		expect(result.bill.usage).toBeUndefined();
	});
	it("rejects a box marked found without coordinates", async () => {
		const { result } = await run(legacy({ images: [PNG], questions: { s: { type: "box", instructions: "Signature?" } } }),
			{ s: { type: "box", box: null, found: 0.9, confidence: 0.9 } });
		expect(result.upstream.status).toBe(502);
	});
});

describe("Typed-answer request validation and routing", () => {
	it.each([
		{ q: { type: "number", instructions: "How many?", range: [5, 1] } },
		{ q: { type: "number", instructions: "How many?", step: 1 } },
		{ q: { type: "number", instructions: "How many?", range: [0, 10], step: 3 } },
		{ q: { type: "boxes", instructions: "Every tree.", max: 17 } },
		{ q: { type: "text", instructions: "Name?", criteria: { a: "b" } } },
	])("rejects invalid typed questions: %j", questions => {
		expect(DecisionsSchema.safeParse({ model: "liquid-ai/d1.2", state: "x", images: [PNG], questions }).success).toBe(false);
	});
	it("requires an image for boxes and rejects audio beside native input", () => {
		expect(DecisionsSchema.safeParse({ model: "m", state: "x", questions: { q: { type: "boxes", instructions: "Trees" } } }).success).toBe(false);
		expect(DecisionsSchema.safeParse({ model: "m", input: "x", audio: [`data:audio/wav;base64,${WAV}`],
			questions: [{ type: "predicate", instructions: "?" }] }).success).toBe(false);
		expect(DecisionsSchema.safeParse({ model: "m", state: "x", audio: ["https://example.com/a.wav"],
			questions: { q: { type: "noul", instructions: "?" } } }).success).toBe(false);
	});
	it("routes typed questions only to routes that list them, and remote audio away from inline-only routes", () => {
		const d12 = { providerId: "liquid-ai", inputModalities: ["text", "image", "audio"], capabilityParams: {
			images: true, audio: true, audio_urls: false, box: true,
			question_types: ["text", "number", "date", "spans", "boxes", "multi_choice"],
		} } as unknown as ProviderCandidate;
		const d11 = { providerId: "liquid-ai", inputModalities: ["text", "image"], capabilityParams: { images: true } } as unknown as ProviderCandidate;
		const google = { providerId: "google-ai-studio", inputModalities: ["text", "image", "audio"],
			capabilityParams: { images: true, audio: true } } as unknown as ProviderCandidate;
		expect(filterDecisionCandidatesByModalities([d12, d11], legacy({ questions: typedQuestions }))).toEqual([d12]);
		const multi = legacy({ questions: { t: typedQuestions.topics } });
		expect(filterDecisionCandidatesByModalities([d11], multi)).toEqual([]);
		const plain = legacy({ questions: { q: { type: "choice", instructions: "?", criteria: { a: null } } } });
		expect(filterDecisionCandidatesByModalities([d12, d11], plain)).toEqual([d12, d11]);
		const remoteAudio: IRDecisionsRequest = { ...plain, audio: [{ type: "audio", source: "url", data: "https://example.com/a.wav" }] };
		expect(filterDecisionCandidatesByModalities([d12, google], remoteAudio)).toEqual([google]);
	});
});
