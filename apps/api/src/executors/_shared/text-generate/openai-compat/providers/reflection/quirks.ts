import type { ProviderQuirks } from "../../quirks/types";

export const reflectionQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (ir.reasoning?.effort !== undefined) request.reasoning_effort = ir.reasoning.effort;
		if (request.max_tokens !== undefined) {
			request.max_completion_tokens = request.max_tokens;
			delete request.max_tokens;
		}
	},
	extractReasoning: ({ choice, rawContent }) => ({
		main: rawContent,
		reasoning: typeof choice?.message?.reasoning_content === "string" && choice.message.reasoning_content.length > 0
			? [choice.message.reasoning_content]
			: [],
	}),
};
