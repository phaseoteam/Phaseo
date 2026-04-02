type ProviderCandidateDiagnostics = {
	totalProviders?: number;
	supportsEndpointCount?: number;
	candidateCount?: number;
};

type ParsedGatewayError = {
	error?: string;
	description?: string;
	message?: string;
	status_code?: number;
	generation_id?: string;
	provider_candidate_diagnostics?: ProviderCandidateDiagnostics;
	failure_sample?: Array<{
		provider?: string | null;
		status?: number | null;
		upstream_error_code?: string | null;
		upstream_error_message?: string | null;
		upstream_error_description?: string | null;
	}>;
};

export type FormattedRoomError = {
	title: string;
	message: string;
	hint?: string;
	statusCode?: number;
	generationId?: string;
};

function parseJsonLike(raw: string): ParsedGatewayError | null {
	const trimmed = raw.trim();
	const candidates = [trimmed];
	const firstBrace = trimmed.indexOf("{");
	const lastBrace = trimmed.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
	}
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as ParsedGatewayError;
			}
		} catch {
			// Best-effort parse only.
		}
	}
	return null;
}

function titleFromCode(code: string): string {
	const normalized = code.trim().toLowerCase();
	if (!normalized) return "Request failed";
	if (normalized === "unsupported_model_or_endpoint") {
		return "Unsupported model or endpoint";
	}
	if (normalized === "insufficient_funds") return "Insufficient funds";
	if (normalized === "validation_error") return "Validation error";
	if (normalized === "rate_limited") return "Rate limited";
	return normalized
		.split("_")
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}

function hintForGatewayError(payload: ParsedGatewayError): string | undefined {
	const code = String(payload.error ?? "").trim().toLowerCase();
	if (code === "unsupported_model_or_endpoint") {
		const diagnostics = payload.provider_candidate_diagnostics;
		if ((diagnostics?.totalProviders ?? 0) === 0) {
			return "No provider is currently routable for this model in this room. Try provider Auto or choose a model that supports this endpoint.";
		}
		return "Try provider Auto, then retry with a model that supports this room endpoint.";
	}
	const statusCode =
		typeof payload.status_code === "number" ? payload.status_code : null;
	const message = `${payload.description ?? ""} ${payload.message ?? ""}`.toLowerCase();
	const failureProviders = Array.isArray(payload.failure_sample)
		? payload.failure_sample
				.map((entry) => String(entry?.provider ?? "").trim().toLowerCase())
				.filter(Boolean)
		: [];
	const appearsGoogleAuthIssue =
		statusCode === 401 &&
		(message.includes("google") ||
			message.includes("gemini") ||
			message.includes("veo") ||
			failureProviders.includes("google-ai-studio") ||
			failureProviders.includes("google"));
	if (appearsGoogleAuthIssue) {
		return "Google Veo authentication failed. Verify the selected BYOK key (or gateway GOOGLE_AI_STUDIO_API_KEY), and ensure that key is valid for Gemini API access and not restricted by referrer/IP.";
	}
	return undefined;
}

export function formatRoomError(rawError: string): FormattedRoomError {
	const fallbackMessage = rawError.trim() || "The request failed.";
	const parsed = parseJsonLike(fallbackMessage);
	if (!parsed) {
		return {
			title: "Request failed",
			message: fallbackMessage,
		};
	}
	const title = titleFromCode(String(parsed.error ?? ""));
	const message =
		(parsed.description && parsed.description.trim()) ||
		(parsed.message && parsed.message.trim()) ||
		fallbackMessage;
	return {
		title,
		message,
		hint: hintForGatewayError(parsed),
		statusCode:
			typeof parsed.status_code === "number" ? parsed.status_code : undefined,
		generationId:
			typeof parsed.generation_id === "string" && parsed.generation_id.trim()
				? parsed.generation_id.trim()
				: undefined,
	};
}
