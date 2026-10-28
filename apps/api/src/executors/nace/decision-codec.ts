import { z } from "zod";
import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";

const models = ["drex-v1.0", "drex-v1.5", "drex-v2.0", "drex-max"] as const;
const instructions = z.string().optional();
const description = z.string().nullable();
const question = z.discriminatedUnion("type", [
	z.object({ type: z.literal("noul"), instructions, criteria: z.object({ true: description.optional(), false: description.optional() }).strict().optional() }).strict().refine(
		(q) => Boolean(q.instructions?.trim() || q.criteria?.true?.trim() || q.criteria?.false?.trim()),
		"Boolean questions need instructions or criteria",
	),
	z.object({ type: z.literal("choice"), instructions, criteria: z.record(z.string().min(1), description).refine((v) => Object.keys(v).length > 0) }).strict(),
	z.object({ type: z.literal("score"), instructions, criteria: z.array(z.string()).min(1) }).strict(),
]);

const requestSchema = z.object({
	model: z.enum(models),
	state: z.json(),
	questions: z.record(z.string().min(1), question).refine((v) => Object.keys(v).length > 0),
	images: z.array(z.string().regex(/^(?:data:image\/(?:png|jpeg|webp);base64,)?[A-Za-z0-9+/]+={0,2}$/)).min(1).max(8).optional(),
}).strict();

/** Pure translation only: this module does not enable routing or perform inference. */
export function encodeNaceDecisionRequest(request: IRDecisionsRequest) {
	const model = request.model.replace(/^nace\//, "");
	if (request.audio?.length || request.videos?.length) throw new Error("Nace decisions do not support audio or video");
	if (request.providerOptions && Object.keys(request.providerOptions).length) throw new Error("Nace decision provider options are unsupported");
	const images = request.images?.map((image) => typeof image === "string" ? image : `data:${image.content_type};base64,${image.base64}`);
	const parsed = requestSchema.parse({ model, state: request.state, questions: request.questions, ...(images === undefined ? {} : { images }) });
	const max = model === "drex-max";
	if (Object.keys(parsed.questions).length > (max ? 16 : 512)) throw new Error("Too many decision questions");
	if (parsed.images && !max) throw new Error("Images require Drex Max");
	for (const q of Object.values(parsed.questions)) {
		if (max && q.criteria && Object.keys(q.criteria).length > 255) throw new Error("Too many decision options");
	}
	const body = {
		...parsed,
		questions: parsed.questions,
	};
	if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 4 * 1024 * 1024) throw new Error("Decision body exceeds 4 MiB");
	return body;
}

const probability = z.number().min(0).max(1);
const probabilities = z.record(z.string(), probability);
const answer = z.discriminatedUnion("type", [
	z.object({ type: z.literal("noul"), noul: probability }),
	z.object({ type: z.literal("choice"), choice: z.string(), confidence: probability, probabilities }),
	z.object({ type: z.literal("score"), score: z.number().nonnegative(), legend: z.array(z.string()).min(1), confidence: probability, probabilities }),
]);
const tokens = z.number().int().nonnegative();
const responseSchema = z.object({
	model: z.enum(models),
	request_id: z.string().min(1),
	answers: z.record(z.string(), answer),
	usage: z.object({ input_tokens: tokens, output_tokens: tokens, image_tokens: tokens.optional() }),
	evaluation_time_ms: z.number().nonnegative(),
});

export function decodeNaceDecisionResponse(raw: unknown, request: IRDecisionsRequest): IRDecisionsResponse & { providerRequestId: string; evaluationTimeMs: number } {
	const expected = encodeNaceDecisionRequest(request);
	const result = responseSchema.parse(raw);
	if (result.model !== expected.model) throw new Error("Nace returned an unexpected model");
	if (Object.keys(result.answers).length !== Object.keys(expected.questions).length) throw new Error("Nace returned an unexpected answer count");
	for (const [id, q] of Object.entries(expected.questions)) {
		const a = result.answers[id];
		if (!a || a.type !== q.type) throw new Error("Nace returned an unexpected answer type");
		if (a.type === "choice" && q.type === "choice") {
			if (!Object.hasOwn(q.criteria, a.choice)) throw new Error("Nace returned an unknown choice");
			validateDistribution(a.probabilities, Object.keys(q.criteria));
		}
		if (a.type === "score" && q.type === "score") {
			if (JSON.stringify(a.legend) !== JSON.stringify(q.criteria) || a.score > a.legend.length - 1) throw new Error("Nace returned an invalid score scale");
			validateDistribution(a.probabilities, q.criteria.map((_, i) => String(i)));
			const expectedScore = q.criteria.reduce((sum, _, i) => sum + i * a.probabilities[String(i)], 0);
			// Match the shared native decision decoder's allowance for rounding.
			if (Math.abs(a.score - expectedScore) > 0.02) throw new Error("Nace returned a score inconsistent with its probabilities");
		}
	}
	if ((result.usage.image_tokens ?? 0) > result.usage.input_tokens) throw new Error("Invalid Nace image usage");
	return {
		model: request.model,
		providerRequestId: result.request_id,
		answers: result.answers,
		usage: {
			inputTokens: result.usage.input_tokens,
			outputTokens: result.usage.output_tokens,
			totalTokens: result.usage.input_tokens + result.usage.output_tokens,
			...(result.usage.image_tokens === undefined ? {} : { _ext: { inputImageTokens: result.usage.image_tokens } }),
		},
		evaluationTimeMs: result.evaluation_time_ms,
	};
}

function validateDistribution(values: Record<string, number>, labels: string[]) {
	if (Object.keys(values).length !== labels.length || labels.some((label) => !Object.hasOwn(values, label))) throw new Error("Nace returned an incomplete probability distribution");
	// Upstream rounds each probability independently.
	if (Math.abs(Object.values(values).reduce((sum, p) => sum + p, 0) - 1) > 0.0001 * labels.length + Number.EPSILON) throw new Error("Nace returned an invalid probability distribution");
}
