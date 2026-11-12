// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

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

const CHAT_OPTION_KEYS = [
	"min_p", "typical_p", "prompt_cache_isolation_key", "raw_output",
	"perf_metrics_in_response", "mirostat_target", "mirostat_lr", "echo",
	"echo_last", "ignore_eos", "context_length_exceeded_behavior",
	"reasoning_history", "return_token_ids", "prompt_truncate_len", "safe_tokenization",
] as const;

export const fireworksQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		// Fireworks Responses endpoint follows OpenAI field names.
		// Normalize only responses-shaped payloads and keep Chat payloads untouched.
		const isResponsesRequest = request.input_items != null || request.input != null;
		// Fireworks keeps a prompt cache per replica and routes on `user` or
		// x-session-affinity. Without a client user, use the workspace-namespaced cache key.
		// https://docs.fireworks.ai/guides/prompt-caching
		if (request.user == null && typeof ir.promptCacheKey === "string" && ir.promptCacheKey.length > 0) {
			request.user = ir.promptCacheKey;
		}
		if (!isResponsesRequest) {
			const options = ir.vendor?.fireworks;
			if (options && typeof options === "object") {
				for (const key of CHAT_OPTION_KEYS) {
					if (options[key] !== undefined) request[key] = options[key];
				}
			}

			const reasoning = ir.reasoning;
			if (reasoning && request.reasoning_effort == null) {
				if (reasoning.enabled === false || reasoning.effort === "none") {
					request.reasoning_effort = "none";
				} else if (typeof reasoning.maxTokens === "number" && reasoning.maxTokens > 0) {
					request.reasoning_effort = reasoning.maxTokens;
				} else if (typeof reasoning.effort === "string") {
					request.reasoning_effort = reasoning.effort === "minimal" ? "low" : reasoning.effort;
				} else if (reasoning.enabled === true) {
					request.reasoning_effort = "medium";
				}
			}
			return;
		}

		if (request.input == null && request.input_items != null) {
			request.input = request.input_items;
			delete request.input_items;
		}

		// Fireworks Responses stores responses unless store is false. Keep the gateway
		// default (no storage) unless the client asked for it.
		if (ir.store !== true) request.store = false;
		// prompt_cache_key is not in the Fireworks Responses schema; affinity goes via
		// `user` and the x-session-affinity header instead.
		delete request.prompt_cache_key;

		if (Array.isArray(request.tools)) {
			request.tools = request.tools.map(normalizeResponsesTool);
		}

		if (request.tool_choice) {
			request.tool_choice = normalizeResponsesToolChoice(request.tool_choice);
		}

		normalizeResponsesFormat(request);
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
};
