// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

const MOONSHOT_PROVIDER_IDS = new Set([
	"moonshot-ai",
	"moonshotai",
	"moonshot-ai-turbo",
	"moonshotai-turbo",
]);

const K2_7_CODE_MODELS = new Set([
	"kimi-k2.7-code",
	"moonshotai/kimi-k2.7-code",
]);

const K3_MODELS = new Set([
	"kimi-k3",
	"moonshotai/kimi-k3",
	"kimi-k3.1-pro",
	"moonshotai/kimi-k3.1-pro",
	"kimi-k3.1-pro-highspeed",
	"moonshotai/kimi-k3.1-pro-highspeed",
]);

const K2_MULTIMODAL_MODELS = new Set([
	"kimi-k2.5",
	"kimi-k2.6",
	"moonshotai/kimi-k2.5",
	"moonshotai/kimi-k2.6",
]);

const isMoonshot = (providerId?: string) =>
	MOONSHOT_PROVIDER_IDS.has(String(providerId ?? "").trim().toLowerCase());

function isK27CodeModel(model: unknown): boolean {
	return K2_7_CODE_MODELS.has(String(model ?? "").trim().toLowerCase());
}

function isK3Model(model: unknown): boolean {
	return K3_MODELS.has(String(model ?? "").trim().toLowerCase());
}

function normalizeK2MultimodalRequest(request: Record<string, any>) {
	if (!K2_MULTIMODAL_MODELS.has(String(request?.model ?? "").trim().toLowerCase())) return;
	const thinkingEnabled = request.thinking?.type !== "disabled";
	const fixedTemperature = thinkingEnabled ? 1 : 0.6;
	if (request.temperature !== undefined && request.temperature !== fixedTemperature) delete request.temperature;
	if (request.top_p !== undefined && request.top_p !== 0.95) delete request.top_p;
	if (request.n !== undefined && request.n !== 1) delete request.n;
	if (request.frequency_penalty !== undefined && request.frequency_penalty !== 0) delete request.frequency_penalty;
	if (request.presence_penalty !== undefined && request.presence_penalty !== 0) delete request.presence_penalty;
	if (thinkingEnabled && request.tool_choice !== undefined) {
		const choice = typeof request.tool_choice === "string" ? request.tool_choice.toLowerCase() : "";
		if (choice !== "auto" && choice !== "none") request.tool_choice = Array.isArray(request.tools) && request.tools.length ? "auto" : "none";
	}
}

function normalizeK27CodeRequest(request: Record<string, any>) {
	if (!isK27CodeModel(request?.model)) return;

	// K2.7 Code rejects disabled thinking. Omit or enable it instead.
	if (request.thinking && typeof request.thinking === "object") {
		if (request.thinking.type === "disabled") {
			request.thinking = { ...request.thinking, type: "enabled" };
		}
	}

	// K2.7 Code only accepts the documented fixed/default sampling values.
	if (typeof request.temperature === "number" && request.temperature !== 1) {
		delete request.temperature;
	}
	if (typeof request.top_p === "number" && request.top_p !== 0.95) {
		delete request.top_p;
	}
	if (
		typeof request.frequency_penalty === "number" &&
		request.frequency_penalty !== 0
	) {
		delete request.frequency_penalty;
	}
	if (
		typeof request.presence_penalty === "number" &&
		request.presence_penalty !== 0
	) {
		delete request.presence_penalty;
	}

	// Tool choice is restricted to auto/none for this model.
	const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
	if (request.tool_choice !== undefined) {
		const normalizedToolChoice =
			typeof request.tool_choice === "string"
				? request.tool_choice.trim().toLowerCase()
				: null;
		if (normalizedToolChoice !== "auto" && normalizedToolChoice !== "none") {
			request.tool_choice = hasTools ? "auto" : "none";
		}
	}
}

function normalizeK3Request(request: Record<string, any>, ir: Record<string, any>) {
	if (!isK3Model(request?.model)) return;
	// Moonshot selects Highspeed by model ID; the gateway tier is not an API field.
	if (String(request.model).includes("kimi-k3.1-pro")) delete request.service_tier;

	// K3 always thinks and replaces the K2.x thinking object with top-level reasoning_effort.
	delete request.thinking;
	if (ir?.reasoning && typeof ir.reasoning === "object") {
		const effort = ir.reasoning.effort;
		request.reasoning_effort = effort === "max" || effort === "xhigh"
			? "max"
			: effort === "high" || effort === "medium"
				? "high"
				: "low";
	}

	// These sampling values are fixed upstream and should be omitted from requests.
	delete request.temperature;
	delete request.top_p;
	delete request.frequency_penalty;
	delete request.presence_penalty;

}

export const moonshotQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (request.max_tokens !== undefined && request.max_completion_tokens === undefined) {
			request.max_completion_tokens = request.max_tokens;
		}
		delete request.max_tokens;

		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((message: any) => {
				if (!Array.isArray(message?.content)) return message;
				return {
					...message,
					content: message.content.map((part: any) =>
						part?.type === "input_video" ? { ...part, type: "video_url" } : part,
					),
				};
			});
		}

		if (!isK3Model(request?.model) && ir?.reasoning && typeof ir.reasoning === "object") {
			request.thinking = {
				type: ir.reasoning.enabled === false || ir.reasoning.effort === "none" ? "disabled" : "enabled",
				...(ir.reasoning.context === "all_turns" ? { keep: "all" } : {}),
			};
		}
		// Moonshot chat schema is stricter on role enums than OpenAI's newer "developer" role.
		// Normalize to "system" before upstream dispatch.
		if (Array.isArray(request?.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		normalizeK27CodeRequest(request);
		normalizeK2MultimodalRequest(request);
		normalizeK3Request(request, ir);
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
};

export { isMoonshot };
