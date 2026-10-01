import type { IRDecisionQuestion, IRDecisionsRequest } from "@core/ir";
import { BodyLimitExceededError, readStreamTextWithLimit } from "@core/bounded-stream";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { decodeSystemOneResponse } from "@protocols/systemone/decode";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validAnswer(answer: unknown, question: IRDecisionQuestion): boolean {
	if (!isRecord(answer) || answer.type !== question.type ||
		(answer.confidence !== undefined && !isProbability(answer.confidence))) return false;
	if (question.type === "noul") return isProbability(answer.noul);
	const criteria = question.criteria;
	if (!criteria) return false;
	const keys = Object.keys(criteria);
	const probabilities = answer.probabilities;
	if (!isRecord(probabilities) || Object.keys(probabilities).length !== keys.length ||
		keys.some(key => !Object.prototype.hasOwnProperty.call(probabilities, key) || !isProbability(probabilities[key]))) return false;
	const sum = keys.reduce((total, key) => total + (probabilities[key] as number), 0);
	if (Math.abs(sum - 1) > 0.01) return false;
	if (question.type === "choice") {
		return typeof answer.choice === "string" && keys.includes(answer.choice);
	}
	return typeof answer.score === "number" && Number.isFinite(answer.score) &&
		answer.score >= 0 && answer.score <= keys.length - 1;
}

// Liquid and Perplexity use the same typed-question wire contract at different URLs.
export async function executeSystemOne(
	args: ExecutorExecuteArgs,
	url: string,
	defaultModel: string,
): Promise<ExecutorResult> {
	const ir = args.ir as IRDecisionsRequest;
	const keyInfo = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const body = { model: args.providerModelSlug?.trim() || defaultModel, state: ir.state, questions: ir.questions };
	const mappedRequest = args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest
		? JSON.stringify(body) : undefined;
	const upstream = await fetchUpstream(args, url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			...upstreamTestHeaders(args.meta),
		},
		body: JSON.stringify(body),
	});
	const headersMs = args.upstreamTiming?.timingFor(upstream)?.headersMs;
	const common = {
		kind: "completed" as const,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		...(mappedRequest === undefined ? {} : { mappedRequest }),
		...(headersMs === undefined ? {} : { timing: { latencyMs: headersMs, generationMs: headersMs } }),
	};
	const bill = { cost_cents: 0, currency: "USD" as const, upstream_id: upstream.headers.get("x-request-id") };
	if (!upstream.ok) return { ...common, upstream, bill };
	const malformed = (rawResponse: unknown): ExecutorResult => ({
		...common,
		upstream: Response.json({
			error: "invalid_decisions_response",
			message: "The provider returned an invalid decision response.",
			request_id: args.requestId,
		}, { status: 502 }),
		bill,
		rawResponse,
	});
	let rawBody: string;
	try {
		// Read the original stream: cancelling one side of a cloned body can wait
		// indefinitely for the unread tee branch when the size limit is exceeded.
		rawBody = await readStreamTextWithLimit(upstream.body, 1024 * 1024, "decisions_response_too_large");
	} catch (error) {
		if (error instanceof BodyLimitExceededError) return malformed({ error: "upstream_response_too_large" });
		throw error;
	}
	let payload: unknown;
	try { payload = JSON.parse(rawBody); } catch { return malformed(rawBody || null); }
	if (!isRecord(payload) || !isRecord(payload.answers) || !isRecord(payload.usage)) return malformed(payload);
	const answers = payload.answers;
	const questionIds = Object.keys(ir.questions);
	if (Object.keys(answers).length !== questionIds.length || questionIds.some(id =>
		!Object.prototype.hasOwnProperty.call(answers, id) || !validAnswer(answers[id], ir.questions[id]),
	)) return malformed(payload);
	const inputTokens = payload.usage.input_tokens;
	const outputTokens = payload.usage.output_tokens;
	if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
		typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0 ||
		!Number.isSafeInteger(inputTokens + outputTokens)) return malformed(payload);
	const responseIr = decodeSystemOneResponse(payload, ir.model);
	responseIr.model = ir.model;
	responseIr.usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
	return {
		...common,
		upstream: new Response(rawBody, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers }),
		ir: responseIr,
		bill: { ...bill, usage: {
			requests: 1, input_tokens: inputTokens, input_text_tokens: inputTokens,
			output_tokens: outputTokens, output_text_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
		} },
		rawResponse: payload,
	};
}
