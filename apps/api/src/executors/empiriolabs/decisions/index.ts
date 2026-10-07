import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function invalid(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return { kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" } };
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim() || ir.model.split("/").pop();
	if (model !== "aplomb-1") return invalid(args, "EmpirioLabs Decisions supports aplomb-1.");
	if (ir.images?.length) return invalid(args, "Place EmpirioLabs media nodes inside state rather than the separate images field.");
	const questions = Object.values(ir.questions);
	if (questions.length < 1 || questions.length > 128) return invalid(args, "EmpirioLabs accepts 1 to 128 questions.");
	for (const q of questions) {
		const count = q.criteria ? Object.keys(q.criteria).length : 0;
		if (!["noul", "choice", "score"].includes(q.type)) return invalid(args, "This integration supports noul, choice and score questions.");
		if (q.type === "choice" && (count < 2 || count > (q.abstain === true ? 254 : 255))) return invalid(args, "EmpirioLabs choice questions require 2 to 255 options, or at most 254 with abstention.");
		if (q.type === "score" && (count < 2 || count > 10)) return invalid(args, "EmpirioLabs score questions require 2 to 10 levels.");
	}
	const longContext = ir.rawRequest?.long_context;
	if (longContext !== undefined && longContext !== "fast" && longContext !== "full") return invalid(args, "long_context must be fast or full.");
	const body = { model, state: ir.state, questions: ir.questions, ...(longContext === undefined ? {} : { long_context: longContext }) };
	const keyInfo = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const upstream = await fetchUpstream(args, openAICompatUrl("empiriolabs", "/decisions"), {
		method: "POST", headers: openAICompatHeaders("empiriolabs", keyInfo.key, upstreamTestHeaders(args.meta)), body: JSON.stringify(body),
	});
	const result = await completeSystemOne(args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? JSON.stringify(body) : undefined);
	// Decisions bill the full state and questions once, using input tokens only.
	// All input modalities share Aplomb's input-token rate.
	if (result.kind === "completed" && result.upstream.ok && result.rawResponse?.usage?.output_tokens !== 0) {
		return { ...result, ir: undefined, upstream: Response.json({ error: "invalid_decisions_response", message: "EmpirioLabs Decisions returned unexpected output-token usage." }, { status: 502 }), bill: { cost_cents: 0, currency: "USD" } };
	}
	return result;
};
