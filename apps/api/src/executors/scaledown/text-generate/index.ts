// Purpose: ScaleDown Summarize and Extract over OpenAI-compatible Chat Completions.
// Why: Both are task models with fixed sampling, no streaming and no tools; the
// result is a JSON string in choices[0].message.content.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
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
	return cherryPickIRParams(ir, { params: SUPPORTED_PARAMS });
}

// Runs on the caller's request, before preprocess drops unsupported params.
function rejection(args: ExecutorExecuteArgs): ExecutorResult | null {
	const ir = args.ir as IRChatRequest;
	const task = scaledownTask(args.providerModelSlug?.trim() || ir.model);
	if (!task) return invalid(args, "ScaleDown Chat Completions supports summarize and extract.");
	if (ir.stream) return invalid(args, "ScaleDown models return one complete result and do not support streaming.");
	if (ir.tools?.length) return invalid(args, "ScaleDown models do not support tools.");
	if (task === "extract" && ir.responseFormat?.type !== "json_schema") {
		return invalid(args, "ScaleDown Extract requires response_format with type json_schema describing the fields to extract.");
	}
	return null;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	return executeOpenAIWire(args, { forceChat: true, useClientStreamingMode: true });
}

const textExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess: (ir) => ir,
	transformStream: (stream) => stream,
});

export const executor: ProviderExecutor = async args => rejection(args) ?? textExecutor(args);
