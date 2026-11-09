// Purpose: Parallel Decisions Fast on Parallel's web-grounded /v1/decisions endpoint.
// Why: Parallel answers typed noul, choice and score questions with probabilities from live web
// evidence, at a flat per-request price (https://docs.parallel.ai/decisions/decisions-quickstart).
// How: Posts state and questions with an x-api-key header, validates answers through the shared
// System One path (which already reports one request), and allows a per-question refusal.

import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { getBindings } from "@/runtime/env";

const DEFAULT_BASE_URL = "https://api.parallel.ai";
const MAX_QUESTIONS = 100;
const MIN_CHOICES = 2;
const MAX_CHOICES = 255;
const MIN_SCORE_LEVELS = 2;
const MAX_SCORE_LEVELS = 10;
// Parallel keys answers by question name and only accepts these characters in a name.
const QUESTION_NAME = /^[A-Za-z0-9_-]+$/;
const GENERATION_CONTROLS = ["temperature", "top_p", "max_tokens", "max_output_tokens", "max_completion_tokens", "reasoning", "reasoning_effort", "tools", "tool_choice"];

function invalid(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Returns the questions Parallel accepts, or the reason the request cannot be sent.
function prepareQuestions(ir: IRDecisionsRequest): Record<string, Record<string, unknown>> | string {
	const entries = Object.entries(ir.questions ?? {});
	if (entries.length < 1 || entries.length > MAX_QUESTIONS) {
		return `Parallel Decisions accepts 1 to ${MAX_QUESTIONS} questions per request.`;
	}
	const questions: Record<string, Record<string, unknown>> = {};
	for (const [name, question] of entries) {
		if (!QUESTION_NAME.test(name)) return `Question name "${name}" must use only letters, numbers, underscores and hyphens.`;
		if (!["noul", "choice", "score"].includes(question.type)) {
			return "Parallel Decisions supports noul (predicate), choice and score questions.";
		}
		if (typeof question.instructions !== "string" || !question.instructions.trim()) {
			return `Question "${name}" needs plain-text instructions.`;
		}
		const criteria = question.criteria;
		if (question.type === "choice") {
			const count = isRecord(criteria) ? Object.keys(criteria).length : 0;
			if (count < MIN_CHOICES || count > MAX_CHOICES) {
				return `Parallel Decisions choice questions need ${MIN_CHOICES} to ${MAX_CHOICES} options.`;
			}
		}
		if (question.type === "score" && (!Array.isArray(criteria) || criteria.length < MIN_SCORE_LEVELS || criteria.length > MAX_SCORE_LEVELS)) {
			return `Parallel Decisions score questions need an ordered list of ${MIN_SCORE_LEVELS} to ${MAX_SCORE_LEVELS} levels.`;
		}
		// Send only the fields Parallel documents; extra keys on a question could fail its validation.
		questions[name] = { type: question.type, instructions: question.instructions, ...(criteria === undefined ? {} : { criteria }) };
	}
	return questions;
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const raw = ir.rawRequest;
	if (ir.images?.length || ir.audio?.length || ir.videos?.length) {
		return invalid(args, "Parallel Decisions accepts text and JSON state only; images, audio and video are not supported.");
	}
	if (raw?.stream === true || GENERATION_CONTROLS.some(name => raw?.[name] != null) ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		return invalid(args, "Parallel Decisions does not support streaming, tools, generation controls, or provider options.");
	}
	const questions = prepareQuestions(ir);
	if (typeof questions === "string") return invalid(args, questions);

	// Parallel has a single mode ("fast") and no model parameter, so none is sent.
	const body = { state: ir.state, questions };
	const bindings = getBindings();
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.PARALLEL_API_KEY,
	);
	const baseUrl = (String(bindings.PARALLEL_BASE_URL ?? "").trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
	const upstream = await fetchUpstream(args, `${baseUrl}/v1/decisions`, {
		method: "POST",
		headers: {
			"x-api-key": keyInfo.key,
			"Content-Type": "application/json",
			...upstreamTestHeaders(args.meta),
		},
		body: JSON.stringify(body),
	});
	return completeSystemOne(
		args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? JSON.stringify(body) : undefined,
		payload => payload,
		{ allowRefusal: true },
	);
};
