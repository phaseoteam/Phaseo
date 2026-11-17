// Purpose: Venice executor for decision models (Jev and Clef) on Venice's beta Decisions API.
// Why: decision models do not serve chat. Venice serves them at POST /api/v1/systemone, a beta alias
// of /decisions that follows the TypeSafe System One protocol
// (https://docs.venice.ai/api-reference/endpoint/decisions/systemone).
// How: Rejects inputs Venice's schema refuses (it sets additionalProperties: false), then sends
// model/state/questions and inline PNG/JPEG images, and validates answers with the shared helper.

import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

// Venice documents three question types: noul, choice and score.
const SUPPORTED_QUESTION_TYPES = new Set(["noul", "choice", "score"]);
const MAX_IMAGES = 4;
// Venice accepts only these image types, as data URIs or {content_type, base64} objects.
const IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|jpg);base64,/;
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

// Request fields Venice's Decisions schema does not take.
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

function supportedImage(image: NonNullable<IRDecisionsRequest["images"]>[number]): boolean {
	return typeof image === "string" ? IMAGE_DATA_URI.test(image) : IMAGE_CONTENT_TYPES.has(image.content_type);
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim();
	if (!model) return unsupported(args, "Venice Decisions requires a configured upstream model.");
	const raw = ir.rawRequest;
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	if (ir.audio?.length || ir.videos?.length) return unsupported(args, "Venice Decisions does not accept audio or video.");
	if (parts.some(part => part && typeof part === "object" && (part as { type?: unknown }).type === "image_url")) {
		return unsupported(args, "Venice Decisions takes images in the top-level images field, not inside state.");
	}
	const images = ir.images ?? [];
	if (images.length > MAX_IMAGES) return unsupported(args, `Venice Decisions accepts at most ${MAX_IMAGES} images.`);
	if (!images.every(supportedImage)) return unsupported(args, "Venice Decisions accepts inline PNG or JPEG images only.");
	if (UNSUPPORTED_FIELDS.some(name => raw?.[name] != null) || ir.decisionContext?.safety_identifier != null ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		return unsupported(args, "Venice Decisions does not support streaming, tools, safety_identifier, service tiers, generation controls or provider options.");
	}
	const unsupportedType = Object.values(ir.questions).find(question => !SUPPORTED_QUESTION_TYPES.has(question.type));
	if (unsupportedType) {
		return unsupported(args, `Venice Decisions supports predicate, choice and score questions; ${unsupportedType.type} questions are unsupported.`);
	}
	return executeSystemOne(args, openAICompatUrl(args.providerId, "/systemone"), model, { forwardMedia: images.length > 0 });
};
