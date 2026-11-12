// Purpose: ScaleDown Summarize and Extract over OpenAI-compatible Chat Completions.
// Why: Both are task models with fixed sampling and no tools; the result is a JSON
// string in choices[0].message.content. ScaleDown does not stream ("Streaming is not
// supported; the full result is returned in one response",
// https://docs.scaledown.ai/api-reference/summarize), but the text pipeline always asks
// executors for a stream, so the one complete result is replayed as a stream.

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { buildSyntheticServerToolStream } from "@pipeline/surfaces/server-tools.stream";
import type { ProviderExecutor } from "../../types";

const SUPPORTED_PARAMS = ["max_tokens", "response_format"];

function invalid(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return { kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_provider_feature", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" } };
}

function scaledownTask(model: string): "summarize" | "extract" | null {
	const name = model.trim().toLowerCase().split("/").pop() ?? "";
	if (/^summarize(?:-\d+)?$/.test(name)) return "summarize";
	if (/^extract(?:-\d+)?$/.test(name)) return "extract";
	return null;
}

export function preprocess(ir: IRChatRequest): IRChatRequest {
	const next = cherryPickIRParams(ir, { params: SUPPORTED_PARAMS });
	if (next.responseFormat?.type === "json_schema") {
		next.responseFormat = { ...next.responseFormat, strict: false };
	}
	return next;
}

// Runs on the caller's request, before preprocess drops unsupported params.
function rejection(args: ExecutorExecuteArgs): ExecutorResult | null {
	const ir = args.ir as IRChatRequest;
	const task = scaledownTask(args.providerModelSlug?.trim() || ir.model);
	if (!task) return invalid(args, "ScaleDown Chat Completions supports summarize and extract.");
	if (ir.tools?.length) return invalid(args, "ScaleDown models do not support tools.");
	const unsupported = ([
		"temperature", "topP", "topK", "minP", "seed", "stop",
		"frequencyPenalty", "presencePenalty", "repetitionPenalty", "logitBias",
		"logprobs", "topLogprobs", "toolChoice", "parallelToolCalls", "maxToolCalls",
	] as const).filter(key => ir[key] !== undefined);
	if (unsupported.length) return invalid(args, `ScaleDown models do not support: ${unsupported.join(", ")}.`);
	if (task === "extract" && ir.responseFormat?.type !== "json_schema") {
		return invalid(args, "ScaleDown Extract requires response_format with type json_schema describing the fields to extract.");
	}
	if (ir.responseFormat?.type === "json_schema" && ir.responseFormat.strict === true) {
		return invalid(args, "ScaleDown models do not support strict JSON schemas.");
	}
	return null;
}

/** Replay one complete ScaleDown result as the stream the caller asked for. */
function replayAsStream(args: ExecutorExecuteArgs, result: ExecutorResult): ExecutorResult {
	if (result.kind !== "completed" || !result.ir || !result.upstream.ok) return result;
	const ir = result.ir as IRChatResponse;
	const payload = encodeOpenAIChatResponse(ir, args.requestId);
	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const synthetic = protocol === "openai.chat.completions"
		? buildSyntheticServerToolStream({ protocol, payload, requestId: args.requestId, model: payload.model, created: payload.created })
		: createSyntheticResponsesStreamFromIR(ir, args.requestId);
	// Messages clients need Messages events, not the Responses events the replay is written in.
	const stream = synthetic && protocol === "anthropic.messages"
		? resolveStreamForProtocol(new Response(synthetic), args, "responses", { canonicalResponsesEvents: true })
		: synthetic;
	if (!stream) throw new Error("scaledown_synthetic_stream_failed");
	return {
		kind: "stream",
		stream,
		streamAlreadyTransformed: true,
		upstream: result.upstream,
		bill: result.bill,
		keySource: result.keySource,
		byokKeyId: result.byokKeyId,
		mappedRequest: result.mappedRequest,
		usageFinalizer: async () => result.bill,
		timing: { ...result.timing, latencyMs: undefined },
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	// Always one non-streaming upstream call; ScaleDown has no streaming mode.
	const result = await executeOpenAIWire(
		{ ...args, ir: { ...(args.ir as IRChatRequest), stream: false } },
		{ forceChat: true, useClientStreamingMode: true },
	);
	return (args.ir as IRChatRequest).stream ? replayAsStream(args, result) : result;
}

const textExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess: (ir) => ir,
	transformStream: (stream) => stream,
});

export const executor: ProviderExecutor = async args => rejection(args) ?? textExecutor(args);
