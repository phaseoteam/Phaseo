// Purpose: Provider-specific request sanitization for OpenAI-compatible adapters.
// Why: Prevents forwarding parameters that provider docs mark unsupported/invalid.
// How: Drops or rewrites incompatible fields before upstream requests.

type OpenAICompatRoute = "responses" | "chat" | "legacy_completions";

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

function deleteIfOutOfRange(
	request: Record<string, any>,
	key: string,
	min: number,
	max: number,
	dropped: string[],
) {
	const value = request[key];
	if (value == null) return;
	if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
		delete request[key];
		dropped.push(key);
	}
}

function deleteIfNotPositiveInt(
	request: Record<string, any>,
	key: string,
	dropped: string[],
) {
	const value = request[key];
	if (value == null) return;
	if (!Number.isInteger(value) || value <= 0) {
		delete request[key];
		dropped.push(key);
	}
}

export function sanitizeOpenAICompatRequest(args: {
	providerId: string;
	route: OpenAICompatRoute;
	model?: string | null;
	request: Record<string, any>;
}): { request: Record<string, any>; dropped: string[] } {
	const request = { ...args.request };
	const dropped: string[] = [];
	const model = normalizeModelName(args.model);

	// Baseline numeric hygiene across OpenAI-compatible providers.
	deleteIfOutOfRange(request, "temperature", 0, 2, dropped);
	deleteIfOutOfRange(request, "top_p", 0, 1, dropped);
	deleteIfOutOfRange(request, "frequency_penalty", -2, 2, dropped);
	deleteIfOutOfRange(request, "presence_penalty", -2, 2, dropped);
	deleteIfOutOfRange(request, "top_logprobs", 0, 20, dropped);
	deleteIfNotPositiveInt(request, "max_tokens", dropped);
	deleteIfNotPositiveInt(request, "max_output_tokens", dropped);

	switch (args.providerId) {
		case "x-ai":
			// xAI Responses docs: instructions are currently unsupported.
			if (args.route === "responses" && "instructions" in request) {
				delete request.instructions;
				dropped.push("instructions");
			}
			break;
		case "deepseek":
			// DeepSeek docs: for reasoner models these are not supported.
			if (model.includes("reasoner")) {
				for (const key of ["temperature", "top_p", "presence_penalty"]) {
					if (key in request) {
						delete request[key];
						dropped.push(key);
					}
				}
			}
			break;
		case "qwen":
			// DashScope OpenAI compatibility: use max_completion_tokens for Qwen 3 models.
			if (args.route !== "legacy_completions") {
				if (typeof request.max_tokens === "number" && request.max_completion_tokens == null) {
					request.max_completion_tokens = request.max_tokens;
					delete request.max_tokens;
					dropped.push("max_tokens");
				}
				if (typeof request.max_output_tokens === "number" && request.max_completion_tokens == null) {
					request.max_completion_tokens = request.max_output_tokens;
					delete request.max_output_tokens;
					dropped.push("max_output_tokens");
				}
			}
			break;
		default:
			break;
	}

	return { request, dropped };
}

