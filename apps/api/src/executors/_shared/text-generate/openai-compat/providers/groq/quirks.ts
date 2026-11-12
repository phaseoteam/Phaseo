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
	transformRequest: ({ request, ir }) => {
		const isResponsesRequest = request.input_items != null || request.input != null;

		// Groq currently rejects these legacy text-completions fields on OpenAI-compatible routes.
		// Remove them proactively to avoid retry churn.
		delete request.logprobs;
		if (!isResponsesRequest) delete request.top_logprobs;
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

		// https://console.groq.com/docs/api-reference: Chat service_tier is auto, on_demand
		// (the default), flex or performance; Responses takes auto, default or flex.
		if (request.service_tier === "standard") {
			request.service_tier = isResponsesRequest ? "default" : "on_demand";
		}

		// Responses API route normalization.
		if (!isResponsesRequest) {
			dropUnsupportedGptOssEffort(request);
			return;
		}

		if (ir.reasoning && request.reasoning == null) {
			const effort = ir.reasoning.effort
				?? (ir.reasoning.enabled === false ? "none" : ir.reasoning.enabled === true ? "medium" : undefined);
			if (effort !== undefined) request.reasoning = { effort };
		}

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
		dropUnsupportedGptOssEffort(request);
	},
};

/**
 * gpt-oss on Groq takes reasoning effort low, medium or high only; other values are a 400
 * (https://console.groq.com/docs/api-reference). Its reasoning cannot be turned off, so
 * "none" is left out and the model default (medium) applies.
 */
function dropUnsupportedGptOssEffort(request: Record<string, any>) {
	if (!String(request.model ?? "").toLowerCase().includes("gpt-oss")) return;
	const allowed = new Set(["low", "medium", "high"]);
	if (typeof request.reasoning_effort === "string" && !allowed.has(request.reasoning_effort)) {
		delete request.reasoning_effort;
	}
	if (request.reasoning && typeof request.reasoning.effort === "string" && !allowed.has(request.reasoning.effort)) {
		delete request.reasoning.effort;
		if (Object.keys(request.reasoning).length === 0) delete request.reasoning;
	}
}
