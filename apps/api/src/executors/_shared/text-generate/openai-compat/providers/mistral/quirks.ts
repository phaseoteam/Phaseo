// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

const MISTRAL_UNSUPPORTED_CHAT_FIELDS = [
	"service_tier",
	"speed",
	"prompt_cache_key",
	"safety_identifier",
	"background",
	"modalities",
	"image_config",
] as const;

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
		}

		// Mistral uses `random_seed` instead of OpenAI's `seed`.
		if (request.seed != null && request.random_seed == null) {
			request.random_seed = request.seed;
		}
		if (request.seed != null) {
			delete request.seed;
		}

		// Mistral chat schema does not support OpenAI-specific advanced controls.
		// Drop these proactively so /responses-surface requests convert cleanly to chat.
		for (const key of MISTRAL_UNSUPPORTED_CHAT_FIELDS) {
			delete request[key];
		}
	},
};


