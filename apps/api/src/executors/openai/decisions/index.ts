import type { IRDecisionQuestion, IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import { NativeDecisionsBodySchema } from "@core/decisions";
import { decodeNativeDecisionAnswer } from "@protocols/decisions/decode";
import { readStreamTextWithLimit, BodyLimitExceededError } from "@core/bounded-stream";
import type { ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function record(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function probability(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function text(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

function questionBody(name: string, question: IRDecisionQuestion): Record<string, unknown> {
	const instructions = text(question.instructions);
	switch (question.type) {
		case "noul":
			return {
				name, type: "predicate",
				instructions: question.criteria
					? instructions + "\nCondition criteria: " + JSON.stringify(question.criteria)
					: instructions,
			};
		case "choice":
			return {
				name, type: "choice", instructions,
				choices: Object.entries(question.criteria ?? {}).map(([value, description]) => ({
					value, ...(description == null ? {} : { description }),
				})),
			};
		case "score":
			return {
				name, type: "score", instructions,
				levels: (question.criteria as string[]).map(label => ({ label })),
			};
	}
}

// OpenAI uses an ordered array; Phaseo uses a map of named questions.
// Validate names, types and distributions before exposing normalized answers.
function normalizeAnswer(answer: unknown, name: string, question: IRDecisionQuestion): Record<string, any> | null {
	if (!record(answer) || answer.name !== name) return null;
	if (answer.type === "refusal") return { type: "refusal" };
	if (question.type === "noul") {
		return answer.type === "predicate" && probability(answer.probability)
			? { type: "noul", noul: answer.probability }
			: null;
	}
	if (answer.type !== question.type || !probability(answer.confidence) || !Array.isArray(answer.probabilities)) return null;
	const keys = Object.keys(question.criteria ?? {});
	if (answer.probabilities.length !== keys.length) return null;
	const probabilities: Record<string, number> = Object.create(null);
	let sum = 0;
	for (const option of answer.probabilities) {
		if (!record(option) || !probability(option.probability)) return null;
		if (question.type === "choice" ? typeof option.value !== "string" :
			!Number.isInteger(option.value) || option.label !== (question.criteria as string[])[option.value]) return null;
		const key = String(option.value);
		if (!keys.includes(key) || Object.hasOwn(probabilities, key)) return null;
		probabilities[key] = option.probability;
		sum += option.probability;
	}
	if (Math.abs(sum - 1) > 0.01 + Number.EPSILON * 8) return null;
	if (question.type === "choice") {
		return typeof answer.choice === "string" && keys.includes(answer.choice)
			? { type: "choice", choice: answer.choice, probabilities, confidence: answer.confidence }
			: null;
	}
	if (typeof answer.score !== "number" || !Number.isFinite(answer.score) ||
		answer.score < 0 || answer.score > keys.length - 1) return null;
	const expectedScore = keys.reduce((total, key) => total + Number(key) * probabilities[key], 0);
	if (Math.abs(answer.score - expectedScore) > 0.02) return null;
	return {
		type: "score", score: answer.score, probabilities, confidence: answer.confidence,
		legend: Object.fromEntries((question.criteria as string[]).map((label, index) => [String(index), label])),
	};
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const invalid = (message: string): ExecutorResult => ({
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	});
	if (args.providerId !== "openai" || args.providerModelSlug !== "gpt-6-luna") {
		return invalid("OpenAI Decisions requires the gpt-6-luna provider route.");
	}
	if (ir.audio?.length || ir.videos?.length) return invalid("OpenAI Decisions does not support audio or video inputs.");
	if (!(ir.decisionContext ? NativeDecisionsBodySchema.safeParse(ir.decisionContext) : DecisionsSchema.safeParse(ir)).success) {
		return invalid("Invalid Phaseo decision request.");
	}
	const entries = Object.entries(ir.questions);
	// Undocumented controls must not be silently dropped.
	const unsupportedControl = [
		"stream", "service_tier", "reasoning", "reasoning_effort",
		"max_tokens", "max_output_tokens", "temperature", "top_p", "tools", "tool_choice",
		...(!ir.decisionContext ? ["safety_identifier"] : []),
	].find(key => ir.rawRequest?.[key] != null);
	if (unsupportedControl) {
		return invalid(`The ${unsupportedControl} control is not supported by the Phaseo OpenAI Decisions contract.`);
	}
	const inputText = text(ir.state);
	const input = ir.images?.length ? [{
		role: "user",
		content: [
			{ type: "input_text", text: inputText },
			...ir.images.map(image => ({
				type: "input_image",
				image_url: typeof image === "string" ? image : `data:${image.content_type};base64,${image.base64}`,
			})),
		],
	}] : inputText;
	const body = ir.decisionContext ? {
		model: args.providerModelSlug,
		input: ir.decisionContext.input, questions: ir.decisionContext.questions,
		...(ir.decisionContext.safety_identifier === undefined ? {} : { safety_identifier: ir.decisionContext.safety_identifier }),
	} : { model: args.providerModelSlug, input, questions: entries.map(([name, question]) => questionBody(name, question)) };
	const keyInfo = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const serialized = JSON.stringify(body);
	const upstream = await fetchUpstream(args, openAICompatUrl(args.providerId, "/decisions"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, {
			"Idempotency-Key": args.requestId, ...upstreamTestHeaders(args.meta),
		}),
		body: serialized,
	});
	const headersMs = args.upstreamTiming?.timingFor(upstream)?.headersMs;
	const bill = { cost_cents: 0, currency: "USD", upstream_id: upstream.headers.get("x-request-id") };
	const common = {
		kind: "completed" as const, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
		...(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? { mappedRequest: serialized } : {}),
		...(headersMs === undefined ? {} : { timing: { latencyMs: headersMs, generationMs: headersMs } }),
	};
	if (!upstream.ok) return { ...common, upstream };
	const malformed = (rawResponse: unknown): ExecutorResult => ({
		...common,
		upstream: Response.json({ error: "invalid_decisions_response", message: "OpenAI returned an invalid decision response.", request_id: args.requestId }, { status: 502 }),
		rawResponse,
	});
	let rawBody: string;
	try {
		rawBody = await readStreamTextWithLimit(upstream.body, 1024 * 1024, "decisions_response_too_large");
	} catch (error) {
		if (error instanceof BodyLimitExceededError) return malformed({ error: "upstream_response_too_large" });
		throw error;
	}
	let payload: unknown;
	try { payload = JSON.parse(rawBody); } catch { return malformed(rawBody || null); }
	if (!record(payload) || typeof payload.model !== "string" || !payload.model.trim() ||
		!Array.isArray(payload.answers) || payload.answers.length !== entries.length || !record(payload.usage)) return malformed(payload);
	const answers: Record<string, any> = Object.create(null);
	for (let index = 0; index < entries.length; index++) {
		const [name, question] = entries[index];
		const answer = ir.decisionContext
			? decodeNativeDecisionAnswer(payload.answers[index], ir.decisionContext.questions[index])
			: normalizeAnswer(payload.answers[index], name, question);
		if (!answer) return malformed(payload);
		answers[name] = answer;
	}
	const inputTokens = payload.usage.input_tokens;
	const outputTokens = payload.usage.output_tokens;
	if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
		!Number.isSafeInteger(outputTokens) || outputTokens < 0 ||
		!Number.isSafeInteger(inputTokens + outputTokens)) return malformed(payload);
	const responseIr: IRDecisionsResponse = {
		model: ir.model, answers, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
		...(ir.decisionContext ? { nativeAnswers: payload.answers, nativeUsage: payload.usage } : {}),
	};
	// Decisions charges for aggregate input only. Keep cache details out of the
	// pricing meters: the upstream contract explicitly has no separate cache fees.
	return {
		...common,
		upstream: new Response(rawBody, { status: upstream.status, headers: upstream.headers }),
		ir: responseIr,
		bill: { ...bill, usage: { requests: 1, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens } },
		rawResponse: payload,
	};
};
