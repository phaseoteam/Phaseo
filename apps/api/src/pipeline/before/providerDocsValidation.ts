// Purpose: Provider-doc compatibility checks for request parameters.
// Why: Prevents routing requests to providers when payload values are known invalid.
// How: Applies lightweight provider-specific rules derived from public API docs.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { err } from "./http";

type ValidationDetail = {
	message: string;
	path: string[];
	keyword: string;
	params: Record<string, any>;
};

type ValidationResult =
	| { ok: true; providers: ProviderCandidate[]; body: any }
	| { ok: false; response: Response };

const TEXT_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses", "messages"]);

const UNSUPPORTED_TEXT_PARAMS: Record<string, Set<string>> = {
	anthropic: new Set([
		"frequency_penalty",
		"presence_penalty",
		"logit_bias",
		"logprobs",
		"top_logprobs",
		"seed",
		"prompt_cache_key",
		"safety_identifier",
		"background",
	]),
	google: new Set([
		"frequency_penalty",
		"presence_penalty",
		"logit_bias",
		"logprobs",
		"top_logprobs",
		"seed",
		"service_tier",
		"prompt_cache_key",
		"safety_identifier",
		"background",
	]),
	"google-ai-studio": new Set([
		"frequency_penalty",
		"presence_penalty",
		"logit_bias",
		"logprobs",
		"top_logprobs",
		"seed",
		"service_tier",
		"prompt_cache_key",
		"safety_identifier",
		"background",
	]),
};

function validateProviderSpecific(
	providerId: string,
	endpoint: Endpoint,
	model: string,
	body: any,
	requestedParams: string[],
): ValidationDetail[] {
	const details: ValidationDetail[] = [];
	const unsupportedParams = UNSUPPORTED_TEXT_PARAMS[providerId];
	if (unsupportedParams) {
		for (const param of requestedParams) {
			if (!unsupportedParams.has(param)) continue;
			details.push({
				message: `Provider "${providerId}" does not support parameter "${param}" for text generation.`,
				path: [param],
				keyword: "unsupported_param",
				params: { provider: providerId, param },
			});
		}
	}

	// xAI Responses docs: `instructions` currently unsupported.
	if ((providerId === "x-ai" || providerId === "xai") && endpoint === "responses" && body?.instructions != null) {
		details.push({
			message: `Provider "${providerId}" does not currently support the "instructions" field on /responses.`,
			path: ["instructions"],
			keyword: "unsupported_param",
			params: { provider: providerId, param: "instructions" },
		});
	}

	// DeepSeek docs: reasoner models do not support these controls.
	if (providerId === "deepseek" && model.toLowerCase().includes("reasoner")) {
		for (const param of ["temperature", "top_p", "presence_penalty"]) {
			if (body?.[param] == null) continue;
			details.push({
				message: `Provider "deepseek" reasoner models do not support "${param}".`,
				path: [param],
				keyword: "unsupported_param",
				params: { provider: providerId, model, param },
			});
		}
	}

	return details;
}

export function validateProviderDocsCompliance(args: {
	endpoint: Endpoint;
	body: any;
	requestId: string;
	teamId: string;
	model: string;
	providers: ProviderCandidate[];
	requestedParams: string[];
}): ValidationResult {
	if (!TEXT_ENDPOINTS.has(args.endpoint)) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	const filtered: ProviderCandidate[] = [];
	const failed: Array<{ providerId: string; details: ValidationDetail[] }> = [];

	for (const provider of args.providers) {
		const details = [
			...validateProviderSpecific(
				provider.providerId,
				args.endpoint,
				args.model,
				args.body,
				args.requestedParams,
			),
		];
		if (details.length > 0) {
			failed.push({ providerId: provider.providerId, details });
		} else {
			filtered.push(provider);
		}
	}

	if (filtered.length > 0) {
		return { ok: true, providers: filtered, body: args.body };
	}

	const details = failed.flatMap((entry) => entry.details);
	return {
		ok: false,
		response: err("validation_error", {
			details: details.length > 0
				? details
				: [{
					message: `No providers accepted this request for model "${args.model}".`,
					path: ["provider"],
					keyword: "no_supported_provider",
					params: { model: args.model },
				}],
			request_id: args.requestId,
			team_id: args.teamId,
		}),
	};
}
