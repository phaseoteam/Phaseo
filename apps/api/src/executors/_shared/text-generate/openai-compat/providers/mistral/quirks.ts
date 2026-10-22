// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRContentPart } from "@core/ir";
import { MISTRAL_REASONING_FORMAT, canReplayReasoning, sealReasoningState } from "@core/reasoning-state";
import type { ProviderQuirks } from "../../quirks/types";

const MISTRAL_UNSUPPORTED_CHAT_FIELDS = [
	"safety_identifier",
	"background",
	"modalities",
	"image_config",
] as const;

const MISTRAL_FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mistral's chat content takes documents as `document_url` (a URL or a base64
 * data URL) or as `{ type: "file", file_id }` for a Mistral upload (a UUID),
 * both with no other fields; it has no OpenAI `file` object.
 * https://docs.mistral.ai/api/#tag/chat/operation/chat_completion_v1_chat_completions_post
 * https://docs.mistral.ai/capabilities/document_ai/document_qna
 */
export function mapFilePartToMistral(part: Extract<IRContentPart, { type: "file" }>): any {
	const name = part.filename ? { document_name: part.filename } : {};
	if (part.source === "url") return { type: "document_url", document_url: part.data, ...name };
	if (part.source === "data") {
		return { type: "document_url", document_url: `data:${part.mimeType || "application/pdf"};base64,${part.data}`, ...name };
	}
	if (MISTRAL_FILE_ID.test(part.data)) return { type: "file", file_id: part.data };
	throw Object.assign(
		new Error("Mistral reads only its own file ids (UUIDs); send the document as file_data or a URL."),
		{ code: "unsupported_parameter", param: "file_id" },
	);
}

function readThinkingText(thinking: unknown): string {
	if (typeof thinking === "string") return thinking;
	if (!Array.isArray(thinking)) return "";
	return thinking
		.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "")
		.join("");
}

/**
 * Mistral reasoning replies carry `content` as a list of chunks instead of a
 * string: ThinkChunks (`{ type: "thinking", thinking: [{ type: "text", text }],
 * signature? }`) and TextChunks (`{ type: "text", text }`). Streams send such
 * lists while the model thinks and at the transition, then plain strings;
 * zai-glm models always send lists. A ThinkChunk `signature` lets Mistral
 * replay reasoning across turns. Returns null when `content` is not a list.
 * https://docs.mistral.ai/capabilities/reasoning
 */
export function splitContentChunks(content: unknown): { text: string; reasoning: string; signatures: string[] } | null {
	if (!Array.isArray(content)) return null;
	let text = "";
	let reasoning = "";
	const signatures: string[] = [];
	for (const chunk of content) {
		if (typeof chunk === "string") {
			text += chunk;
		} else if (chunk?.type === "thinking") {
			reasoning += readThinkingText(chunk.thinking);
			if (typeof chunk.signature === "string" && chunk.signature) signatures.push(chunk.signature);
		} else if ((chunk?.type === undefined || chunk?.type === "text") && typeof chunk?.text === "string") {
			text += chunk.text;
		}
	}
	return { text, reasoning, signatures };
}

export function isMistralProvider(providerId: string | null | undefined): boolean {
	return providerId === "mistral" || providerId === "mistral-eu";
}

type ReasoningOrigin = { providerId?: string | null; model?: string | null };

/**
 * A Chat `reasoning_details` entry carrying a sealed ThinkChunk signature, so
 * clients send it back and the gateway replays it only to Mistral.
 */
function signedReasoningDetail(signature: string, text: string, origin: ReasoningOrigin, id: string): Record<string, unknown> {
	return {
		id,
		index: 0,
		type: "reasoning.text",
		text,
		signature: sealReasoningState({
			format: MISTRAL_REASONING_FORMAT,
			kind: "signature",
			value: signature,
			...(origin.model ? { model: origin.model } : {}),
			...(origin.providerId ? { provider: origin.providerId } : {}),
		}),
		format: MISTRAL_REASONING_FORMAT,
	};
}

/**
 * Rewrite a streamed chunk's chunk-list deltas into the string `content` and
 * `reasoning_content` deltas every gateway stream reader and Chat client
 * expects. A ThinkChunk signature becomes a sealed `reasoning_details` entry
 * holding the reasoning streamed so far.
 */
export function normalizeMistralStreamChunk(
	chunk: any,
	state: { requestId?: string; providerId?: string | null; model?: string | null; choiceStates?: Map<number, { reasoningChunks: string[] }> },
): void {
	if (!Array.isArray(chunk?.choices)) return;
	const choiceStates = (state.choiceStates ??= new Map());
	for (const choice of chunk.choices) {
		const delta = choice?.delta;
		const split = splitContentChunks(delta?.content);
		if (!split) continue;
		const index = Number(choice.index ?? 0);
		const choiceState = choiceStates.get(index) ?? { reasoningChunks: [] };
		choiceStates.set(index, choiceState);
		delta.content = split.text;
		if (split.reasoning) {
			delta.reasoning_content = (typeof delta.reasoning_content === "string" ? delta.reasoning_content : "") + split.reasoning;
			choiceState.reasoningChunks.push(split.reasoning);
		}
		if (split.signatures.length > 0) {
			const reasoningSoFar = choiceState.reasoningChunks.join("");
			delta.reasoning_details = [
				...(Array.isArray(delta.reasoning_details) ? delta.reasoning_details : []),
				...split.signatures.map((signature, position) => signedReasoningDetail(
					signature,
					reasoningSoFar,
					state,
					`${state.requestId ?? "req"}-reasoning-${index}-${position + 1}`,
				)),
			];
		}
	}
}

/**
 * Assistant history for Mistral: reasoning goes back as ThinkChunks ahead of
 * the answer text, as Mistral asks ("always replay the full assistant message
 * (including ThinkChunk)"). Mistral's own signature is kept when the reasoning
 * came from the same model; reasoning carrying another provider family's state
 * is not sent. Returns null when there is no reasoning to replay.
 * https://docs.mistral.ai/capabilities/reasoning
 */
export function toMistralAssistantContent(
	content: IRContentPart[],
	target: { providerId: string; model?: string | null },
): any[] | null {
	const chunks: any[] = [];
	for (const part of content) {
		if (part.type !== "reasoning_text" || !part.text) continue;
		if (part.reasoningFormat && part.reasoningFormat !== MISTRAL_REASONING_FORMAT) continue;
		const signature = part.reasoningFormat === MISTRAL_REASONING_FORMAT && part.thoughtSignature && canReplayReasoning(
			{ format: part.reasoningFormat, model: part.reasoningModel, provider: part.reasoningProvider },
			target,
		)
			? part.thoughtSignature
			: undefined;
		chunks.push({ type: "thinking", thinking: [{ type: "text", text: part.text }], ...(signature ? { signature } : {}) });
	}
	if (chunks.length === 0) return null;
	const text = content.filter((part) => part.type === "text").map((part) => part.text).join("");
	if (text) chunks.push({ type: "text", text });
	return chunks;
}

export const mistralQuirks: ProviderQuirks = {
	extractReasoning: ({ choice, rawContent, providerId, model }) => {
		const split = splitContentChunks(choice?.message?.content);
		if (!split) return { main: rawContent, reasoning: [] };
		if (split.signatures.length > 0 && choice?.message) {
			// Read back by the shared sealed-reasoning step, which attaches the
			// signature to the reasoning part.
			choice.message.reasoning_details = [
				...(Array.isArray(choice.message.reasoning_details) ? choice.message.reasoning_details : []),
				...split.signatures.map((signature, position) =>
					signedReasoningDetail(signature, split.reasoning, { providerId, model }, `mistral-reasoning-${position + 1}`)),
			];
		}
		return { main: split.text, reasoning: split.reasoning ? [split.reasoning] : [] };
	},
	transformStreamChunk: ({ chunk, accumulated }) => normalizeMistralStreamChunk(chunk, accumulated ?? {}),

	transformRequest: ({ request }) => {
		if (!request || typeof request !== "object") return;

		// Mistral chat schema supports system/user/assistant/tool roles.
		// Normalize OpenAI "developer" role for compatibility.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
			// Mistral's AudioChunk takes `input_audio` as the base64 string itself.
			for (const message of request.messages) {
				if (!Array.isArray(message?.content)) continue;
				message.content = message.content.map((part: any) => {
					if (part?.type !== "input_audio" || !part.input_audio || typeof part.input_audio !== "object") return part;
					const audio = part.input_audio.data ?? part.input_audio.url;
					return typeof audio === "string" ? { type: "input_audio", input_audio: audio } : part;
				});
			}
		}

		// Mistral uses `random_seed` instead of OpenAI's `seed`.
		if (request.seed != null && request.random_seed == null) {
			request.random_seed = request.seed;
		}
		if (request.seed != null) {
			delete request.seed;
		}

		// Phaseo exposes OpenAI-style tier names. Mistral's Priority Tier uses
		// `auto` for priority-with-standard-fallback and `standard_only` to opt out.
		if (request.service_tier === "priority" || request.service_tier === "fast") {
			request.service_tier = "auto";
		} else if (request.service_tier === "standard") {
			request.service_tier = "standard_only";
		} else if (
			request.service_tier !== "auto" &&
			request.service_tier !== "standard_only"
		) {
			delete request.service_tier;
		}

		// Mistral supports prompt_cache_key natively. Drop only OpenAI-specific
		// controls that are absent from Mistral's Chat Completion schema.
		// Drop these proactively so /responses-surface requests convert cleanly to chat.
		for (const key of MISTRAL_UNSUPPORTED_CHAT_FIELDS) {
			delete request[key];
		}
	},
};
