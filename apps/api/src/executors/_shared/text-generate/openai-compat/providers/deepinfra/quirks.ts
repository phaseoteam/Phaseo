import type { ProviderQuirks } from "../../quirks/types";

const REASONING_EFFORTS = new Set([
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export const deepInfraQuirks: ProviderQuirks = {
	transformRequest: ({ ir, request }) => {
		const options = ir.vendor?.deepinfra;
		if (options && typeof options === "object") {
			for (const key of ["fail_fast", "min_p", "stop_token_ids", "chat_template_kwargs", "continue_final_message", "ignore_eos"] as const) {
				if (options[key] !== undefined) request[key] = options[key];
			}
		}

		// DeepInfra's OpenAI-compatible schema names video content parts
		// `video_url`, while the gateway IR uses `input_video`.
		if (Array.isArray(request.messages)) {
			for (const message of request.messages) {
				if (!Array.isArray(message?.content)) continue;
				message.content = message.content.map((part: any) =>
					part?.type === "input_video" ? { ...part, type: "video_url" } : part,
				);
			}
		}

		const reasoning = ir.reasoning;
		if (!reasoning || request.reasoning_effort != null || request.reasoning != null) return;

		const effort = reasoning.enabled === false
			? "none"
			: reasoning.effort ?? (reasoning.enabled === true ? "medium" : undefined);
		if (typeof effort === "string" && REASONING_EFFORTS.has(effort)) {
			request.reasoning_effort = effort;
		}
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
};
