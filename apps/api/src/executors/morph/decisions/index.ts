// Purpose: Morph Reflex on Morph's native System One decisions endpoint.
// Why: Reflex answers typed choice, noul and score questions with probabilities and no
// output tokens (https://docs.morphllm.com/models/reflex).
// How: Posts state, questions and inline images to /v1/systemone, validates answers through
// the shared System One path, and reports cached input so the cached-input rate applies.

import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

const MAX_IMAGES = 16;
// "at most 8,000,000 decoded bytes per image" (https://docs.morphllm.com/api-reference/endpoint/systemone).
const MAX_IMAGE_BYTES = 8_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
const GENERATION_CONTROLS = ["temperature", "top_p", "max_tokens", "max_output_tokens", "max_completion_tokens", "reasoning", "reasoning_effort", "tools", "tool_choice"];

function invalid(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

function decodedBytes(base64: string): number {
	const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	return Math.floor((base64.length * 3) / 4) - padding;
}

// Reflex takes inline base64 data URLs only (PNG, JPEG, WebP; at most 16, 8,000,000 bytes each).
// Remote URLs, audio and video return 422 upstream, so reject them locally.
function imageUrls(ir: IRDecisionsRequest): string[] | string {
	const urls = (ir.images ?? []).map(image => typeof image === "string" ? image : `data:${image.content_type};base64,${image.base64}`);
	if (urls.length > MAX_IMAGES) return `Morph Reflex accepts at most ${MAX_IMAGES} images.`;
	for (const url of urls) {
		const match = DATA_URL.exec(url);
		if (!match) return "Morph Reflex images must be PNG, JPEG, or WebP base64 data URLs; remote image URLs are not accepted.";
		if (decodedBytes(match[2]!) > MAX_IMAGE_BYTES) return "Morph Reflex accepts images up to 8,000,000 bytes each.";
	}
	return urls;
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const raw = ir.rawRequest;
	const model = args.providerModelSlug?.trim() || "reflex";
	if (ir.audio?.length || ir.videos?.length) return invalid(args, "Morph Reflex accepts text, JSON and image state only; audio and video are not supported.");
	if (raw?.stream === true || GENERATION_CONTROLS.some(name => raw?.[name] != null) ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		return invalid(args, "Morph Reflex does not support streaming, tools, generation controls, or provider options.");
	}
	for (const question of Object.values(ir.questions)) {
		const count = question.criteria ? Object.keys(question.criteria).length : 0;
		if (!["noul", "choice", "score"].includes(question.type)) return invalid(args, "Morph Reflex supports noul, choice and score questions.");
		if (question.type === "choice" && count < 1) return invalid(args, "Morph Reflex choice questions need at least 1 option.");
		if (question.type === "score" && (!Array.isArray(question.criteria) || count < 2 || count > 10)) {
			return invalid(args, "Morph Reflex score questions need an ordered list of 2 to 10 levels.");
		}
	}
	const images = imageUrls(ir);
	if (typeof images === "string") return invalid(args, images);

	const body = { model, state: ir.state, questions: ir.questions, ...(images.length ? { images } : {}) };
	const keyInfo = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const upstream = await fetchUpstream(args, openAICompatUrl(args.providerId, "/systemone"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(body),
	});
	const result = await completeSystemOne(args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? JSON.stringify(body) : undefined);

	// Morph bills image tokens at the input rate and reports reused input as
	// usage.input_tokens_details.cached_tokens ($0.01/M against $0.042/M).
	const usage = result.bill?.usage as Record<string, unknown> | undefined;
	const payloadUsage = (result.rawResponse as { usage?: Record<string, any> } | undefined)?.usage;
	if (usage && typeof usage.input_tokens === "number") {
		usage.input_text_tokens = usage.input_tokens;
		const cached = Number(payloadUsage?.input_tokens_details?.cached_tokens);
		if (Number.isSafeInteger(cached) && cached > 0 && cached <= usage.input_tokens) {
			usage.input_tokens_details = { cached_tokens: cached };
			// The native decisions encoder emits cached_tokens: 0 unless nativeUsage carries the
			// count, and finalization prefers the encoded payload's usage over the bill's.
			const responseIr = ("ir" in result ? result.ir : undefined) as IRDecisionsResponse | undefined;
			if (responseIr) {
				responseIr.nativeUsage = {
					...(responseIr.nativeUsage ?? {}),
					input_tokens_details: { cached_tokens: cached, cache_write_tokens: 0 },
				};
			}
		}
	}
	return result;
};
