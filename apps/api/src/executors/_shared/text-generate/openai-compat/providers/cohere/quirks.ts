// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

const COHERE_UNSUPPORTED_CHAT_FIELDS = [
	"stream_options",
	"store",
	"metadata",
	"logit_bias",
	"top_logprobs",
	"n",
	"modalities",
	"prediction",
	"audio",
	"service_tier",
	"parallel_tool_calls",
] as const;

function mapCohereReasoningEffort(value?: string): "none" | "high" | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.toLowerCase();
	if (normalized === "none") return "none";
	if (
		normalized === "high" ||
		normalized === "xhigh" ||
		normalized === "medium" ||
		normalized === "low" ||
		normalized === "minimal" ||
		normalized === "xlow"
	) {
		return "high";
	}
	return undefined;
}

export const cohereQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request || typeof request !== "object") return;

		for (const field of COHERE_UNSUPPORTED_CHAT_FIELDS) {
			delete request[field];
		}

		if (request.reasoning_effort == null) {
			const effort = mapCohereReasoningEffort(ir?.reasoning?.effort);
			if (effort) {
				request.reasoning_effort = effort;
			} else if (ir?.reasoning?.enabled === true) {
				request.reasoning_effort = "high";
			} else if (ir?.reasoning?.enabled === false) {
				request.reasoning_effort = "none";
			}
		}

		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},
};

