// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// xAI Provider Quirks
// Maps xAI usage detail fields into OpenAI-compatible naming.

import type { ProviderQuirks } from "./types";

export const xAiQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// If streaming, ask xAI to include usage in the final chunk when supported.
		if (request?.stream) {
			request.stream_options = {
				...(request.stream_options ?? {}),
				include_usage: true,
			};
		}
	},
	normalizeResponse: ({ response }) => {
		const usage = response?.usage;
		if (!usage || typeof usage !== "object") return;

		// xAI uses prompt/completion detail keys; map them to OpenAI-compatible names.
		if (!usage.input_tokens_details && usage.prompt_tokens_details) {
			usage.input_tokens_details = usage.prompt_tokens_details;
		}
		if (!usage.output_tokens_details && usage.completion_tokens_details) {
			usage.output_tokens_details = usage.completion_tokens_details;
		}

		// Ensure token totals are present for downstream billing.
		if (usage.input_tokens == null && usage.prompt_tokens != null) {
			usage.input_tokens = usage.prompt_tokens;
		}
		if (usage.output_tokens == null && usage.completion_tokens != null) {
			usage.output_tokens = usage.completion_tokens;
		}
		if (usage.total_tokens == null && (usage.input_tokens != null || usage.output_tokens != null)) {
			usage.total_tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
		}
	},
};
