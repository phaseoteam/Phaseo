// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

const isMoonshot = (providerId?: string) =>
	providerId === "moonshot-ai" || providerId === "moonshot-ai-turbo";

export const moonshotQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// Moonshot compatibility validates schema payload shape differently.
		applyJsonSchemaFallback(request);

		// Moonshot chat schema is stricter on role enums than OpenAI's newer "developer" role.
		// Normalize to "system" before upstream dispatch.
		if (Array.isArray(request?.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}
	},
};

export { isMoonshot };


