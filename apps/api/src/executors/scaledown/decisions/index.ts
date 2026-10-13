// Purpose: ScaleDown Classify on its Jev-compatible Decisions endpoint.
// Why: Classify-1 answers typed Noul, Choice and Score questions with calibrated
// probabilities instead of generated text.

import type { IRDecisionQuestion, IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

// Choice options become /classify labels, which ScaleDown caps at 20.
const MAX_CHOICE_OPTIONS = 20;

function invalid(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return { kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" } };
}

// ScaleDown takes plain-string instructions and descriptions, and noul questions
// carry no criteria.
function toScaleDownQuestion(question: IRDecisionQuestion): Record<string, unknown> {
	const instructions = typeof question.instructions === "string"
		? question.instructions
		: JSON.stringify(question.instructions);
	if (question.type === "noul") return { type: "noul", instructions };
	if (question.type === "score") return { type: "score", instructions, criteria: question.criteria };
	const criteria = Object.fromEntries(Object.entries(question.criteria as Record<string, string | null>)
		.map(([key, description]) => [key, description ?? key]));
	return { type: "choice", instructions, criteria };
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim() || "classify-1";
	if (!/^classify(?:-\d+)?$/.test(model)) return invalid(args, "ScaleDown Decisions supports classify-1.");
	if (ir.images?.length || ir.audio?.length || ir.videos?.length) {
		return invalid(args, "ScaleDown Decisions accepts text state only.");
	}
	const questions: Record<string, Record<string, unknown>> = {};
	for (const [id, question] of Object.entries(ir.questions)) {
		if (!["noul", "choice", "score"].includes(question.type)) {
			return invalid(args, "ScaleDown Decisions supports noul, choice and score questions.");
		}
		const count = question.criteria ? Object.keys(question.criteria).length : 0;
		if (question.type === "choice" && (count < 2 || count > MAX_CHOICE_OPTIONS)) {
			return invalid(args, `ScaleDown choice questions require 2 to ${MAX_CHOICE_OPTIONS} options.`);
		}
		if (question.type === "score" && (!Array.isArray(question.criteria) || count < 2 || count > 10)) {
			return invalid(args, "ScaleDown score questions require an ordered list of 2 to 10 levels.");
		}
		questions[id] = toScaleDownQuestion(question);
	}
	const body = { model, state: ir.state, questions };
	const keyInfo = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const upstream = await fetchUpstream(args, openAICompatUrl("scaledown", "/scaledown"), {
		method: "POST", headers: openAICompatHeaders("scaledown", keyInfo.key, upstreamTestHeaders(args.meta)), body: JSON.stringify(body),
	});
	return completeSystemOne(args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? JSON.stringify(body) : undefined);
};
