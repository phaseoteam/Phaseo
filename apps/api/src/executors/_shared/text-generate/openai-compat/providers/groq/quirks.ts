// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

const GROQ_RESPONSES_UNSUPPORTED_FIELDS = [
	"previous_response_id",
	"store",
	"truncation",
	"include",
	"safety_identifier",
	"prompt_cache_key",
	"prompt",
] as const;

function normalizeResponsesTool(tool: any): any {
	if (!tool || typeof tool !== "object" || tool.type !== "function") return tool;
	if (!tool.function || typeof tool.function !== "object") return tool;

	const fn = tool.function;
	return {
		type: "function",
		...(typeof fn.name === "string" ? { name: fn.name } : {}),
		...(typeof fn.description === "string" ? { description: fn.description } : {}),
		...(fn.parameters ? { parameters: fn.parameters } : {}),
	};
}

function normalizeResponsesToolChoice(toolChoice: any): any {
	if (!toolChoice || typeof toolChoice !== "object") return toolChoice;
	if (toolChoice.type !== "function" || !toolChoice.function || typeof toolChoice.function !== "object") {
		return toolChoice;
	}
	const name = toolChoice.function.name;
	if (typeof name !== "string" || name.length === 0) return toolChoice;
	return {
		type: "function",
		name,
	};
}

function normalizeResponsesFormat(request: Record<string, any>) {
	const format = request.response_format;
	if (!format || typeof format !== "object" || request.text) return;

	if (format.type === "json_object") {
		request.text = { format: { type: "json_object" } };
		delete request.response_format;
		return;
	}

	if (format.type === "json_schema") {
		const schemaShape = format.json_schema && typeof format.json_schema === "object"
			? format.json_schema
			: {};
		request.text = {
			format: {
				type: "json_schema",
				name: typeof schemaShape.name === "string" && schemaShape.name.length > 0
					? schemaShape.name
					: "response",
				schema: schemaShape.schema ?? {},
				strict: schemaShape.strict !== false,
			},
		};
		delete request.response_format;
	}
}

export const groqQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// Groq currently rejects these legacy text-completions fields on OpenAI-compatible routes.
		// Remove them proactively to avoid retry churn.
		delete request.logprobs;
		delete request.top_logprobs;
		delete request.logit_bias;

		if (request.n != null && request.n !== 1) {
			delete request.n;
		}

		// Groq does not support messages[].name.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) => {
				if (!msg || typeof msg !== "object" || !("name" in msg)) return msg;
				const { name: _name, ...rest } = msg;
				return rest;
			});
		}

		// Responses API route normalization.
		const isResponsesRequest = request.input_items != null || request.input != null;
		if (!isResponsesRequest) return;

		if (request.input == null && request.input_items != null) {
			request.input = request.input_items;
			delete request.input_items;
		}

		if (Array.isArray(request.tools)) {
			request.tools = request.tools.map(normalizeResponsesTool);
		}

		if (request.tool_choice) {
			request.tool_choice = normalizeResponsesToolChoice(request.tool_choice);
		}

		normalizeResponsesFormat(request);

		for (const key of GROQ_RESPONSES_UNSUPPORTED_FIELDS) {
			delete request[key];
		}
	},
};

