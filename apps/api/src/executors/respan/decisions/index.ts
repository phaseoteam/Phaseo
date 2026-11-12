// Purpose: Execute Phaseo Decisions requests with Respan Span-01.
// Why: Span-01 scores behavior probabilities on a conversation span.
// How: Map Noul questions to behaviors and preserve all three probabilities.

import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { getBindings } from "@/runtime/env";

const RESPAN_SCORES_URL = "https://api.respan.ai/api/v1/scores";
const RESPAN_MODELS = new Set(["span-01-free", "span-01-pro"]);

type RespanMessage = Record<string, unknown> & { role: string; content: string };
type RespanSpan = { input: RespanMessage[]; output: RespanMessage };
type PreparedBehavior = { id: string; definition: string };

function isRecord(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(status: number, error: string, message: string, requestId: string): Response {
	return new Response(JSON.stringify({ error, message, request_id: requestId }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function validationFailure(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return {
		kind: "completed",
		terminal: true,
		localClientError: true,
		upstream: jsonResponse(400, "unsupported_decision_request", message, args.requestId),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

function malformedResponse(
	args: ExecutorExecuteArgs,
	upstream: Response,
	rawResponse: unknown,
	keyInfo: ReturnType<typeof resolveProviderKey>,
	captureRequest: boolean,
	requestBody: Record<string, unknown>,
	latencyMs: number,
): ExecutorResult {
	return {
		kind: "completed",
		upstream: jsonResponse(
			502,
			"invalid_respan_span_response",
			"Respan returned an invalid Span-01 score response.",
			args.requestId,
		),
		bill: {
			cost_cents: 0,
			currency: "USD",
			upstream_id: upstream.headers.get("x-request-id") ?? upstream.headers.get("x-respan-log-id"),
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		...(captureRequest ? { mappedRequest: JSON.stringify(requestBody) } : {}),
		rawResponse,
		timing: { latencyMs, generationMs: latencyMs, upstreamRequestCount: 1 },
	};
}

function prepareSpan(state: IRDecisionsRequest["state"]): RespanSpan | string {
	if (!isRecord(state) || Array.isArray(state)) {
		return 'Respan Span-01 requires state shaped as { "input": [...messages], "output": assistantMessage }.';
	}
	const stateRecord = state as Record<string, unknown>;
	if (!Array.isArray(stateRecord.input) || !isRecord(stateRecord.output) || Array.isArray(stateRecord.output)) {
		return 'Respan Span-01 requires state shaped as { "input": [...messages], "output": assistantMessage }.';
	}
	const input = stateRecord.input as unknown[];
	if (input.some((message) => !isRecord(message) || typeof message.role !== "string" || typeof message.content !== "string")) {
		return "Respan state.input must contain text messages with string role and content fields.";
	}
	const output = stateRecord.output as Record<string, unknown>;
	if (output.role !== "assistant" || typeof output.content !== "string") {
		return 'Respan state.output must be an assistant text message with a string content field.';
	}
	return { input: input as RespanMessage[], output: output as RespanMessage };
}

function prepareBehaviors(questions: IRDecisionsRequest["questions"]): PreparedBehavior[] | string {
	if (!isRecord(questions)) return "Respan requires a map of Noul behavior questions.";
	const entries = Object.entries(questions);
	if (entries.length === 0) {
		return "Respan accepts at least one behavior question per request.";
	}

	const behaviors: PreparedBehavior[] = [];
	for (const [id, question] of entries) {
		if (question.type !== "noul") {
			return `Respan Span-01 supports "noul" questions only; "choice" and "score" questions are not supported. Question "${id}" uses "${question.type}".`;
		}
		if (typeof question.instructions !== "string" || !question.instructions.trim()) {
			return `Question "${id}" must use plain-text instructions with Respan Span-01.`;
		}

		const rawCriteria = question.criteria;
		if (rawCriteria !== undefined && (!isRecord(rawCriteria) || Array.isArray(rawCriteria))) {
			return `Question "${id}" has criteria that Respan Span-01 cannot interpret.`;
		}
		const criteriaValues = rawCriteria as Record<string, unknown> | undefined;
		if (criteriaValues && (
			(criteriaValues.true !== undefined && typeof criteriaValues.true !== "string") ||
			(criteriaValues.false !== undefined && typeof criteriaValues.false !== "string")
		)) {
			return `Question "${id}" has criteria that Respan Span-01 cannot interpret.`;
		}
		const criteria = criteriaValues as { true?: string; false?: string } | undefined;
		const definitionParts = [`Behavior: ${question.instructions.trim()}`];
		if (typeof criteria?.true === "string" && criteria.true.trim()) {
			definitionParts.push(`Present when: ${criteria.true.trim()}`);
		}
		if (typeof criteria?.false === "string" && criteria.false.trim()) {
			definitionParts.push(`Absent when: ${criteria.false.trim()}`);
		}
		behaviors.push({ id, definition: definitionParts.join("\n") });
	}
	return behaviors;
}

function resolveRespanModel(args: ExecutorExecuteArgs, ir: IRDecisionsRequest): string | null {
	const requestedModel = args.providerModelSlug?.trim().toLowerCase();
	const catalogModel = ir.model.trim().toLowerCase().split("/").at(-1);
	const modelFromId = catalogModel === "span-01:free"
		? "span-01-free"
		: catalogModel === "span-01"
			? "span-01-pro"
			: catalogModel;
	const model = requestedModel || modelFromId || "";
	return RESPAN_MODELS.has(model) ? model : null;
}

function safeTokenCount(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function scoreResult(value: unknown): { id: string; present: number; absent: number; notObservable: number } | null {
	if (!isRecord(value) || typeof value.id !== "string") return null;
	const present = value.p_present;
	const absent = value.p_absent;
	const notObservable = value.p_not_observable;
	if ([present, absent, notObservable].some((probability) =>
		typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1,
	)) return null;
	if (Math.abs(present + absent + notObservable - 1) > 0.01) return null;
	return { id: value.id, present, absent, notObservable };
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRDecisionsRequest;
	const model = resolveRespanModel(args, ir);
	if (!model) {
		return validationFailure(args, "Respan Decisions supports only respan/span-01:free and respan/span-01.");
	}
	let state = ir.state;
	if (ir.decisionContext && typeof state === "string") {
		try { state = JSON.parse(state); } catch { /* prepareSpan returns the documented span validation error. */ }
	}
	const span = prepareSpan(state);
	if (typeof span === "string") return validationFailure(args, span);
	const behaviors = prepareBehaviors(ir.questions);
	if (typeof behaviors === "string") return validationFailure(args, behaviors);

	const keyInfo = resolveProviderKey(
		{
			providerId: args.providerId,
			byokMeta: args.byokMeta,
			forceGatewayKey: args.meta.forceGatewayKey,
		},
		() => getBindings().RESPAN_API_KEY,
	);
	const requestBody = { model, span, behaviors };
	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const startedAt = performance.now();
	const upstream = await fetchUpstream(args, RESPAN_SCORES_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			...upstreamTestHeaders(args.meta),
		},
		body: JSON.stringify(requestBody),
	});
	const latencyMs = Math.round(performance.now() - startedAt);

	if (!upstream.ok) {
		return {
			kind: "completed",
			upstream,
			bill: {
				cost_cents: 0,
				currency: "USD",
				upstream_id: upstream.headers.get("x-request-id") ?? upstream.headers.get("x-respan-log-id"),
			},
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			...(captureRequest ? { mappedRequest: JSON.stringify(requestBody) } : {}),
			timing: { latencyMs, generationMs: latencyMs, upstreamRequestCount: 1 },
		};
	}

	const rawBody = await upstream.clone().text();
	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		payload = rawBody || null;
	}
	if (!isRecord(payload) || !Array.isArray(payload.results)) {
		return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
	}

	const expectedIds = new Set(behaviors.map((behavior) => behavior.id));
	const scored = payload.results.map(scoreResult);
	if (scored.length !== expectedIds.size || scored.some((result) => !result || !expectedIds.has(result.id))) {
		return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
	}
	const scoreById = new Map<string, NonNullable<(typeof scored)[number]>>();
	for (const result of scored) {
		if (!result || scoreById.has(result.id)) {
			return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
		}
		scoreById.set(result.id, result);
	}

	if (payload.usage !== undefined && !isRecord(payload.usage)) {
		return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
	}
	const rawInputTokens = isRecord(payload.usage) ? payload.usage.input_tokens : undefined;
	const inputTokens = rawInputTokens === undefined ? null : safeTokenCount(rawInputTokens);
	if (rawInputTokens !== undefined && inputTokens === null) {
		return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
	}
	if (model === "span-01-pro" && inputTokens === null) {
		return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
	}
	const answers: Record<string, Record<string, unknown>> = {};
	for (const behavior of behaviors) {
		const score = scoreById.get(behavior.id);
		if (!score) return malformedResponse(args, upstream, payload, keyInfo, captureRequest, requestBody, latencyMs);
		answers[behavior.id] = {
			type: "noul",
			noul: score.present,
			probabilities: {
				true: score.present,
				false: score.absent,
				not_observable: score.notObservable,
			},
		};
	}

	const responseIr: IRDecisionsResponse = {
		model: ir.model,
		answers,
		...(inputTokens === null ? {} : {
			usage: { inputTokens, outputTokens: 0, totalTokens: inputTokens },
		}),
	};
	const usageMeters = inputTokens === null
		? { requests: 1 }
		: {
			requests: 1,
			input_tokens: inputTokens,
			input_text_tokens: inputTokens,
			output_tokens: 0,
			output_text_tokens: 0,
			total_tokens: inputTokens,
		};
	return {
		kind: "completed",
		upstream,
		ir: responseIr,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: usageMeters,
			upstream_id: upstream.headers.get("x-request-id") ?? upstream.headers.get("x-respan-log-id"),
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		...(captureRequest ? { mappedRequest: JSON.stringify(requestBody) } : {}),
		rawResponse: payload,
		timing: { latencyMs, generationMs: latencyMs, upstreamRequestCount: 1 },
	};
}

export const executor: ProviderExecutor = execute;
