// Purpose: Phala executor for System One decision models such as Jared Palmer's Kev 4B.
// Why: Kev 4B does not serve chat; Phala (and RedPill, Phala's gateway) serve it only through
// POST /v1/systemone, which follows the TypeSafe System One protocol
// (https://docs.redpill.ai/api-reference/systemone.md).
// How: Rejects inputs Kev 4B cannot take, then sends model/state/questions to the Phala base URL
// (PHALA_BASE_URL, e.g. https://api.redpill.ai) and validates answers with the shared helper.

import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

// Request fields System One does not take. RedPill forwards only model, state and questions.
const UNSUPPORTED_FIELDS = [
	"stream", "tools", "tool_choice", "service_tier", "safety_identifier",
	"temperature", "top_p", "max_tokens", "max_output_tokens", "max_completion_tokens", "reasoning", "reasoning_effort",
];

function unsupported(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim();
	if (!model) return unsupported(args, "Phala Decisions requires a configured upstream model.");
	const raw = ir.rawRequest;
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	const hasMedia = Boolean(ir.images?.length || ir.audio?.length || ir.videos?.length) ||
		parts.some(part => part && typeof part === "object" && (part as { type?: unknown }).type === "image_url");
	if (hasMedia) return unsupported(args, "Phala Decisions accepts text and JSON state only; images, audio and video are unsupported.");
	if (UNSUPPORTED_FIELDS.some(name => raw?.[name] != null) || ir.decisionContext?.safety_identifier != null ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		return unsupported(args, "Phala Decisions does not support streaming, tools, safety_identifier, service tiers, generation controls or provider options.");
	}
	if (Object.values(ir.questions).some(question => question.type === "box")) {
		return unsupported(args, "Phala Decisions supports predicate, choice and score questions; box questions are unsupported.");
	}
	return executeSystemOne(args, openAICompatUrl(args.providerId, "/systemone"), model);
};
