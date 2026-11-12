// Purpose: Executor for google-ai-studio / decisions.make (Google's Decisions API).
// Why: Google is adding `client.decisions.create` (POST /v1beta/decisions) to the Gemini API. It
// answers typed noul, choice and score questions with calibrated probabilities instead of text.
// The API is not announced yet; this follows the request and response types in the pre-release
// SDK pull requests (googleapis/python-genai#3353, js-genai#2181, go-genai#1106, java-genai#1435).
// How: Maps the IR to Google's request (a map of named questions over one shared input made of
// text, image, audio and video blocks), posts it with an x-goog-api-key header, and validates the
// answers through the shared System One path, which already uses the same noul/choice/score shape.

import type { DecisionInput, DecisionInputPart } from "@core/decisions";
import type { IRDecisionQuestion, IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { getBindings } from "@/runtime/env";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
// Google accepts 2 to 255 options per choice question and 2 to 255 levels per score question.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 255;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
// Controls Google's Decisions request does not have. Dropping one silently would change the answer.
const UNSUPPORTED_CONTROLS = [
	"stream", "service_tier", "reasoning", "reasoning_effort", "max_tokens", "max_output_tokens",
	"max_completion_tokens", "temperature", "top_p", "tools", "tool_choice", "safety_identifier",
];
const AUDIO_MIME: Record<string, string> = {
	wav: "audio/wav", mp3: "audio/mp3", flac: "audio/flac", m4a: "audio/m4a", ogg: "audio/ogg",
};
// Google's media resolution hint; "auto" is the default, so nothing is sent for it.
const IMAGE_RESOLUTION: Record<string, string> = { low: "low", high: "high", original: "ultra_high" };

type Block = Record<string, unknown>;

class DecisionRequestError extends Error {}

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

// Gemini API base, normalised to end in /v1beta (the SDK posts to /{api_version}/decisions).
function baseUrl(): string {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const root = String(bindings.GOOGLE_AI_STUDIO_BASE_URL || bindings.GOOGLE_BASE_URL || DEFAULT_BASE_URL)
		.trim().replace(/\/+$/, "");
	return /\/v1(beta)?$/i.test(root) ? root : `${root}/v1beta`;
}

function textOf(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

function textBlock(text: string): Block {
	return { type: "text", text };
}

// Avoids a regex over what can be a multi-megabyte base64 payload.
function splitDataUrl(value: string): { mime: string; data: string } | null {
	if (!/^data:/i.test(value)) return null;
	const comma = value.indexOf(",");
	if (comma < 0) return null;
	const header = value.slice(5, comma).toLowerCase();
	if (!header.endsWith(";base64")) return null;
	return { mime: header.slice(0, -";base64".length), data: value.slice(comma + 1) };
}

function mediaBlock(kind: "image" | "audio" | "video", value: string, extra: Block = {}): Block {
	const inline = splitDataUrl(value);
	if (inline) {
		if (!inline.mime.startsWith(`${kind}/`) || !inline.data) {
			throw new DecisionRequestError(`A ${kind} input has an invalid data URL.`);
		}
		return { type: kind, data: inline.data, mime_type: inline.mime, ...extra };
	}
	let protocol = "";
	try { protocol = new URL(value).protocol; } catch { /* reported below */ }
	if (protocol !== "https:") {
		throw new DecisionRequestError(`A ${kind} input must be an inline base64 data URL or a public HTTPS URL.`);
	}
	return { type: kind, uri: value, ...extra };
}

function nativePartBlock(part: DecisionInputPart): Block {
	switch (part.type) {
		case "input_text":
			return textBlock(part.text);
		case "input_image": {
			const resolution = part.detail ? IMAGE_RESOLUTION[part.detail] : undefined;
			return mediaBlock("image", part.image_url, resolution ? { resolution } : {});
		}
		case "input_audio": {
			const clip = part.input_audio;
			if (clip.url) return mediaBlock("audio", clip.url);
			return { type: "audio", data: clip.data, mime_type: AUDIO_MIME[clip.format ?? ""] };
		}
		case "input_video":
			return mediaBlock("video", typeof part.video_url === "string" ? part.video_url : part.video_url.url);
	}
}

function nativeBlocks(input: DecisionInput): Block[] {
	if (typeof input === "string") return [textBlock(input)];
	return input.flatMap(message =>
		typeof message.content === "string" ? [textBlock(message.content)] : message.content.map(nativePartBlock));
}

function legacyBlocks(ir: IRDecisionsRequest): Block[] {
	const blocks: Block[] = [textBlock(textOf(ir.state))];
	for (const image of ir.images ?? []) {
		blocks.push(typeof image === "string"
			? mediaBlock("image", image)
			: { type: "image", data: image.base64, mime_type: image.content_type });
	}
	for (const clip of ir.audio ?? []) {
		if (clip.source === "url") {
			blocks.push(mediaBlock("audio", clip.data));
			continue;
		}
		const mime = AUDIO_MIME[clip.format ?? ""];
		if (!mime) throw new DecisionRequestError("Inline audio needs a wav, mp3, flac, m4a or ogg format.");
		blocks.push({ type: "audio", data: clip.data, mime_type: mime });
	}
	for (const video of ir.videos ?? []) blocks.push(mediaBlock("video", video));
	return blocks;
}

// A text-only input is sent as the plain string Google's SDK examples use.
function buildInput(ir: IRDecisionsRequest): string | Block[] {
	const blocks = ir.decisionContext ? nativeBlocks(ir.decisionContext.input) : legacyBlocks(ir);
	const only = blocks[0];
	return blocks.length === 1 && only?.type === "text" ? String(only.text) : blocks;
}

function questionBody(name: string, question: IRDecisionQuestion): Block {
	if (!name.trim()) throw new DecisionRequestError("Question names cannot be empty.");
	const instructions = textOf(question.instructions);
	if (!instructions.trim()) throw new DecisionRequestError(`Question "${name}" needs instructions.`);
	const criteria = question.criteria;
	switch (question.type) {
		case "noul": {
			if (criteria === undefined) return { type: "noul", instructions };
			if (!isRecord(criteria)) throw new DecisionRequestError(`Question "${name}" criteria must be an object with true and false.`);
			const { true: whenTrue, false: whenFalse } = criteria as { true?: unknown; false?: unknown };
			const described = {
				...(typeof whenTrue === "string" ? { true_description: whenTrue } : {}),
				...(typeof whenFalse === "string" ? { false_description: whenFalse } : {}),
			};
			return { type: "noul", instructions, ...(Object.keys(described).length ? { criteria: described } : {}) };
		}
		case "choice": {
			const options = isRecord(criteria) ? Object.entries(criteria) : [];
			if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
				throw new DecisionRequestError(`Google Decisions choice questions need ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`);
			}
			for (const [id] of options) {
				if (!id || id !== id.trim() || CONTROL_CHARACTERS.test(id)) {
					throw new DecisionRequestError(`Choice option "${id}" must be non-empty with no control characters or surrounding whitespace.`);
				}
			}
			// A blank description means "no description" to Google.
			return { type: "choice", instructions, criteria: Object.fromEntries(options.map(([id, description]) => [id, description ?? ""])) };
		}
		case "score": {
			if (!Array.isArray(criteria) || criteria.length < MIN_OPTIONS || criteria.length > MAX_OPTIONS ||
				criteria.some(level => typeof level !== "string" || !level.trim())) {
				throw new DecisionRequestError(`Google Decisions score questions need ${MIN_OPTIONS} to ${MAX_OPTIONS} non-empty levels.`);
			}
			return { type: "score", instructions, criteria };
		}
		default:
			throw new DecisionRequestError("Google Decisions supports noul, choice and score questions, not box questions.");
	}
}

// A blocked input returns 200 with prompt_feedback.block_reason and no answers.
function blockedInput(args: ExecutorExecuteArgs, payload: unknown): Response | null {
	const feedback = isRecord(payload) && isRecord(payload.prompt_feedback) ? payload.prompt_feedback : null;
	if (!feedback || typeof feedback.block_reason !== "string" || !feedback.block_reason) return null;
	return Response.json({
		error: "content_policy_violation",
		message: typeof feedback.block_reason_message === "string" && feedback.block_reason_message
			? feedback.block_reason_message
			: "Google blocked the decision input.",
		block_reason: feedback.block_reason,
		request_id: args.requestId,
	}, { status: 400 });
}

function tokenCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

// Google reports total_input_tokens / total_output_tokens; the shared validator reads input_tokens /
// output_tokens. Thought tokens are billed as output, so they are added in. Anything missing or
// malformed stays missing, which the shared validator rejects rather than billing a guess.
function normalizePayload(payload: unknown): unknown {
	if (!isRecord(payload) || !isRecord(payload.usage)) return payload;
	const input = tokenCount(payload.usage.total_input_tokens);
	const output = tokenCount(payload.usage.total_output_tokens);
	const thoughts = payload.usage.total_thought_tokens === undefined ? 0 : tokenCount(payload.usage.total_thought_tokens);
	if (input === undefined || output === undefined || thoughts === undefined) return { ...payload, usage: undefined };
	return { ...payload, usage: { ...payload.usage, input_tokens: input, output_tokens: output + thoughts } };
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim();
	if (!model) return invalid(args, "Google Decisions needs a provider model.");
	const unsupportedControl = UNSUPPORTED_CONTROLS.find(key => ir.rawRequest?.[key] != null);
	if (unsupportedControl) {
		return invalid(args, `The ${unsupportedControl} control is not supported by Google Decisions.`);
	}
	const entries = Object.entries(ir.questions ?? {});
	if (entries.length < 1) return invalid(args, "At least one decision question is required.");

	let body: { model: string; input: string | Block[]; questions: Record<string, Block> };
	try {
		body = {
			model,
			input: buildInput(ir),
			questions: Object.fromEntries(entries.map(([name, question]) => [name, questionBody(name, question)])),
		};
	} catch (error) {
		if (error instanceof DecisionRequestError) return invalid(args, error.message);
		throw error;
	}

	const env = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => env.GOOGLE_AI_STUDIO_API_KEY || env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
	);
	const serialized = JSON.stringify(body);
	const upstream = await fetchUpstream(args, `${baseUrl()}/decisions`, {
		method: "POST",
		headers: {
			"x-goog-api-key": keyInfo.key,
			"Content-Type": "application/json",
			...upstreamTestHeaders(args.meta),
		},
		body: serialized,
	});
	const result = await completeSystemOne(
		args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? serialized : undefined,
		normalizePayload,
		{ rejectPayload: payload => blockedInput(args, payload) },
	);
	// The shared path labels all input as text unless images are present. Audio and video tokens are
	// not text, and Google has not published per-modality prices, so keep only the aggregate meters.
	if ((ir.audio?.length || ir.videos?.length) && result.bill?.usage) {
		const { input_text_tokens: _text, ...usage } = result.bill.usage as Record<string, number>;
		return { ...result, bill: { ...result.bill, usage } } as ExecutorResult;
	}
	return result;
};
