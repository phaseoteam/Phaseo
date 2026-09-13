// Purpose: GMI Cloud OpenAI-compatible request normalization.
// Why: GMI exposes additional context/EOS controls under its documented Chat API.
// How: Copies validated provider options from IR into the upstream request.

import type { ProviderQuirks } from "../../quirks/types";

export const gmiCloudQuirks: ProviderQuirks = {
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content;
		return { main: rawContent, reasoning: typeof reasoning === "string" && reasoning ? [reasoning] : [] };
	},
	transformRequest: ({ request, ir }) => {
		const options = (ir.vendor as any)?.gmicloud;
		if (typeof options?.ignore_eos === "boolean") {
			request.ignore_eos = options.ignore_eos;
		}
		if (
			options?.context_length_exceeded_behavior === "truncate" ||
			options?.context_length_exceeded_behavior === "error"
		) {
			request.context_length_exceeded_behavior = options.context_length_exceeded_behavior;
		}
	},
};
