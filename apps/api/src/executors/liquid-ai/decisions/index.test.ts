import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRDecisionsRequest } from "@core/ir";
import { resolveProviderExecutor } from "@executors/index";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { decisionIrForRoute, filterDecisionCandidatesByModalities, routeDecisionCandidates } from "@pipeline/execute/modalities";
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
	it("treats a native input_audio data URL as inline: routes to Liquid and forwards it", async () => {
		const dataUrl = `data:audio/wav;base64,${WAV}`;
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "liquid-ai/d1.2", input: [{ role: "user", content: [
			{ type: "input_audio", input_audio: { url: dataUrl } },
		] }], questions: [{ type: "predicate", instructions: "Siren?" }] }));
		const d12 = { providerId: "liquid-ai", inputModalities: ["text", "audio"],
			capabilityParams: { audio: true, audio_urls: false } } as unknown as ProviderCandidate;
		expect(filterDecisionCandidatesByModalities([d12], ir)).toEqual([d12]);
		const { body } = await run(ir, { question_0: { type: "noul", noul: 0.9 } });
		expect(body.audio).toEqual([dataUrl]);
	});
	it("keeps rejecting a missing box for native requests, whose contract has no not-found box", async () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "liquid-ai/d1.2", input: [{ role: "user", content: [
			{ type: "input_image", image_url: PNG },
		] }], questions: [{ type: "box", instructions: "Signature?" }] }));
		const { result } = await run(ir, { question_0: { type: "box", box: null, found: 0.1, confidence: 0.1 } });
		expect(result.upstream.status).toBe(502);
	});
	it("still lets Clef's image check accept a state/map request that also carries audio", () => {
		const ir = legacy({ images: [PNG], audio: [`data:audio/wav;base64,${WAV}`],
			questions: { q: { type: "noul", instructions: "Safe?" } } });
		expect(DecisionsSchema.safeParse(ir).success).toBe(true);
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
	it("requires an image for boxes", () => {
		expect(DecisionsSchema.safeParse({ model: "m", state: "x", questions: { q: { type: "boxes", instructions: "Trees" } } }).success).toBe(false);
	});
	it.each([
		["https://example.com/a.wav"],
		"data:audio/wav;base64," + WAV,
		[],
		["data:audio/aac;base64," + WAV],
		Array.from({ length: 9 }, () => "data:audio/wav;base64," + WAV),
		{ clip: WAV },
	])("keeps ignoring an audio field that is not 1-8 audio data URLs, as before: %j", audio => {
		const ir = legacy({ audio, questions: { q: { type: "noul", instructions: "?" } } });
		expect(ir.audio).toBeUndefined();
	});
	it("keeps ignoring an audio field beside native input, as before", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "m", input: "x", audio: ["data:audio/wav;base64," + WAV],
			questions: [{ type: "predicate", instructions: "?" }] }));
		expect(ir.audio).toBeUndefined();
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
		// Multi-select is a preference: routes that ignore multiple still get the question, as before.
		expect(filterDecisionCandidatesByModalities([d11], multi)).toEqual([d11]);
		expect(filterDecisionCandidatesByModalities([d11, d12], multi)).toEqual([d12]);
		const plain = legacy({ questions: { q: { type: "choice", instructions: "?", criteria: { a: null } } } });
		expect(filterDecisionCandidatesByModalities([d12, d11], plain)).toEqual([d12, d11]);
		const remoteAudio: IRDecisionsRequest = { ...plain, audio: [{ type: "audio", source: "url", data: "https://example.com/a.wav" }] };
		expect(filterDecisionCandidatesByModalities([d12, google], remoteAudio)).toEqual([google]);
	});
	it("sends state/map audio to a route that hears it, otherwise drops it as before", () => {
		const d11 = { providerId: "liquid-ai", inputModalities: ["text", "image"], capabilityParams: { images: true } } as unknown as ProviderCandidate;
		const d12 = { providerId: "liquid-ai", inputModalities: ["text", "image", "audio"],
			capabilityParams: { images: true, audio: true, audio_urls: false } } as unknown as ProviderCandidate;
		const ir = legacy({ audio: ["data:audio/wav;base64," + WAV], questions: { q: { type: "noul", instructions: "Siren?" } } });
		expect(ir.optionalAudio).toBe(true);
		expect(routeDecisionCandidates([d11, d12], ir)).toEqual({ candidates: [d12], dropAudio: false });
		expect(routeDecisionCandidates([d11], ir)).toEqual({ candidates: [d11], dropAudio: true });
		// Native input_audio was always strict: no audio route means no route.
		const native = decodeDecisionsRequest(DecisionsSchema.parse({ model: "m", input: [{ role: "user", content: [
			{ type: "input_audio", input_audio: { data: WAV, format: "wav" } },
		] }], questions: [{ type: "predicate", instructions: "?" }] }));
		expect(routeDecisionCandidates([d11], native)).toEqual({ candidates: [], dropAudio: false });
	});
});

describe("Dropping multiple on routes without multi-select", () => {
	const d11 = { providerId: "liquid-ai", capabilityParams: { images: true } } as unknown as ProviderCandidate;
	const d12 = { providerId: "liquid-ai", capabilityParams: { question_types: ["multi_choice"] } } as unknown as ProviderCandidate;
	const ir = legacy({ questions: { t: typedQuestions.topics, q: { type: "noul", instructions: "Refund?" } } });
	it("keeps multiple for routes that answer multi-select", () => {
		expect(decisionIrForRoute(ir, d12)).toBe(ir);
	});
	it("silently drops multiple for other routes and leaves the rest of the request alone", () => {
		const routed = decisionIrForRoute(ir, d11);
		const { multiple: _multiple, ...plainChoice } = typedQuestions.topics;
		expect(routed.questions).toEqual({ t: plainChoice, q: { type: "noul", instructions: "Refund?" } });
		expect(ir.questions.t).toHaveProperty("multiple", true);
	});
	it("returns the request unchanged when no question sets multiple", () => {
		const plain = legacy({ questions: { q: { type: "noul", instructions: "Refund?" } } });
		expect(decisionIrForRoute(plain, d11)).toBe(plain);
	});
});

describe("Ranking questions", () => {
	const anyRoute = { providerId: "liquid-ai", capabilityParams: { images: true } } as unknown as ProviderCandidate;
	const criteria = { email: "Email support", phone: "Phone call", chat: "Live chat", none: "No follow-up" };
	const probabilities = { email: 0.2, phone: 0.5, chat: 0.2, none: 0.1 };

	it("asks the route a choice question and returns every option ranked by probability", async () => {
		const ir = legacy({ questions: {
			best: { type: "ranking", instructions: "Best follow-up first", criteria },
			refund: { type: "noul", instructions: "Refund?" },
		} });
		const routed = decisionIrForRoute(ir, anyRoute);
		expect(routed.questions.best).toEqual({ type: "choice", instructions: "Best follow-up first", criteria });
		expect(ir.questions.best).toHaveProperty("type", "ranking");
		const { result, body } = await run(routed, {
			best: { type: "choice", choice: "phone", confidence: 0.5, probabilities },
			refund: { type: "noul", noul: 0.9 },
		});
		expect(body.questions.best).toEqual({ type: "choice", instructions: "Best follow-up first", criteria });
		expect(encodeDecisionsResponse(result.ir as any, ir).answers).toEqual({
			// email and chat tie at 0.2: the caller's option order breaks the tie.
			best: { type: "ranking", ranking: ["phone", "email", "chat", "none"], probabilities },
			refund: { type: "noul", noul: 0.9 },
		});
	});
	it("keeps only the top k", async () => {
		const ir = legacy({ questions: { best: { type: "ranking", instructions: "Best first", criteria, top_k: 2 } } });
		const { result } = await run(decisionIrForRoute(ir, anyRoute), {
			best: { type: "choice", choice: "phone", confidence: 0.5, probabilities },
		});
		expect(encodeDecisionsResponse(result.ir as any, ir).answers.best).toEqual({
			type: "ranking", ranking: ["phone", "email"], probabilities,
		});
	});
	it.each([
		{ type: "ranking", instructions: "?", criteria: { a: "A" } },
		{ type: "ranking", instructions: "?", criteria: { a: "A", b: "B" }, top_k: 3 },
		{ type: "ranking", instructions: "?", criteria: { a: "A", b: "B" }, top_k: 0 },
		{ type: "ranking", instructions: "?", criteria: { a: "A", b: "B" }, multiple: true },
	])("rejects invalid ranking questions: %j", q => {
		expect(DecisionsSchema.safeParse({ model: "liquid-ai/d1.2", state: "x", questions: { q } }).success).toBe(false);
	});
	it("routes ranking questions to every route that gives choice probabilities", () => {
		const tev = { providerId: "together", capabilityParams: { choice_probabilities: false } } as unknown as ProviderCandidate;
		const ir = legacy({ questions: { best: { type: "ranking", instructions: "?", criteria } } });
		expect(filterDecisionCandidatesByModalities([anyRoute, tev], ir)).toEqual([anyRoute]);
		// Label-only routes still serve plain choice questions.
		const choice = legacy({ questions: { best: { type: "choice", instructions: "?", criteria } } });
		expect(filterDecisionCandidatesByModalities([anyRoute, tev], choice)).toEqual([anyRoute, tev]);
		// Tev and Respan are skipped even when their capability lacks the flag.
		const unflaggedTev = { providerId: "together", capabilityParams: {} } as unknown as ProviderCandidate;
		const respan = { providerId: "respan", capabilityParams: {} } as unknown as ProviderCandidate;
		expect(filterDecisionCandidatesByModalities([unflaggedTev, respan, anyRoute], ir)).toEqual([anyRoute]);
	});
	it("treats top_k null (sent by generated SDKs) as ranking every option", async () => {
		const ir = legacy({ questions: { best: { type: "ranking", instructions: "Best first", criteria, top_k: null } } });
		const { result } = await run(decisionIrForRoute(ir, anyRoute), {
			best: { type: "choice", choice: "phone", confidence: 0.5, probabilities },
		});
		expect(encodeDecisionsResponse(result.ir as any, ir).answers.best).toEqual({
			type: "ranking", ranking: ["phone", "email", "chat", "none"], probabilities,
		});
	});
});

describe("Other System One providers keep their answer rules", () => {
	it("accepts a single choice when a provider ignores multiple", async () => {
		const { result } = await run(legacy({ questions: { t: typedQuestions.topics } }),
			{ t: { type: "choice", choice: "billing", probabilities: { billing: 0.8, delivery: 0.15, login: 0.05 }, confidence: 0.7 } });
		expect(result.upstream.status).toBe(200);
	});
	it("still rejects a null box unless the provider opts in (only Liquid does)", async () => {
		const ir = legacy({ images: [PNG], questions: { s: { type: "box", instructions: "Signature?" } } });
		const upstream = () => jsonResponse({ answers: { s: { type: "box", box: null, found: 0.1, confidence: 0.1 } }, usage: { input_tokens: 5, output_tokens: 0 } });
		const keyInfo = { source: "gateway" as const, byokId: null };
		expect((await completeSystemOne(argsFor(ir), upstream(), keyInfo)).upstream.status).toBe(502);
		expect((await completeSystemOne(argsFor(ir), upstream(), keyInfo, undefined, undefined, { allowMissingBox: true })).upstream.status).toBe(200);
	});
});
