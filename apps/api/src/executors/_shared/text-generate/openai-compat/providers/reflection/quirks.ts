import type { ProviderQuirks } from "../../quirks/types";

// Reflection requires a non-empty reasoning_content on every assistant message
// and returns 400 missing_required_parameter without it
// (https://developers.reflection.ai/reasoning). Turns with no plain reasoning
// (few-shot examples, history from another model, or a tool-call step the
// model returned without reasoning) get this placeholder.
export const REFLECTION_REASONING_PLACEHOLDER = "…";

export const reflectionQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request.tools?.length) {
			delete request.parallel_tool_calls;
		}
		if (ir.store !== undefined) request.store = ir.store;
		if (ir.reasoning?.effort !== undefined) request.reasoning_effort = ir.reasoning.effort;
		if (request.max_tokens !== undefined) {
			request.max_completion_tokens = request.max_tokens;
			delete request.max_tokens;
		}
		if (Array.isArray(request.messages)) {
			for (const message of request.messages) {
				if (message?.role !== "assistant") continue;
				if (typeof message.reasoning_content === "string" && message.reasoning_content.trim().length > 0) continue;
				message.reasoning_content = REFLECTION_REASONING_PLACEHOLDER;
			}
		}
	},
	extractReasoning: ({ choice, rawContent }) => ({
		main: rawContent,
		reasoning: typeof choice?.message?.reasoning_content === "string" && choice.message.reasoning_content.length > 0
			? [choice.message.reasoning_content]
			: [],
	}),
};
