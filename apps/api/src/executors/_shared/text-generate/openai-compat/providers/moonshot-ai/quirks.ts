// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

const MOONSHOT_PROVIDER_IDS = new Set([
	"moonshot-ai",
	"moonshotai",
	"moonshot-ai-turbo",
	"moonshotai-turbo",
]);

const K2_7_CODE_MODELS = new Set([
	"kimi-k2.7-code",
	"kimi-k2.7-code-highspeed",
	"moonshotai/kimi-k2.7-code",
	"moonshotai/kimi-k2.7-code-highspeed",
]);

const isMoonshot = (providerId?: string) =>
	MOONSHOT_PROVIDER_IDS.has(String(providerId ?? "").trim().toLowerCase());

function isK27CodeModel(model: unknown): boolean {
	return K2_7_CODE_MODELS.has(String(model ?? "").trim().toLowerCase());
}

export function normalizeK27CodeRequest(request: Record<string, any>) {
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

export const moonshotQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// Moonshot compatibility validates schema payload shape differently.
		applyJsonSchemaFallback(request);

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
	},
};

export { isMoonshot };


