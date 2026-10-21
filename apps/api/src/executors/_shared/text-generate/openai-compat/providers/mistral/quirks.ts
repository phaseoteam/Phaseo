// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRContentPart } from "@core/ir";
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

export const mistralQuirks: ProviderQuirks = {
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
