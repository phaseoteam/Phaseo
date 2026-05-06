type ProviderCandidateDiagnostics = {
	totalProviders?: number;
	supportsEndpointCount?: number;
	candidateCount?: number;
	droppedUnsupportedEndpoint?: string[];
	droppedMissingAdapter?: Array<{
		providerId?: string | null;
		endpoint?: string | null;
	}>;
};

type ProviderEnablementDiagnostics = {
	capability?: string;
	providersBefore?: string[];
	providersAfter?: string[];
	dropped?: Array<{
		providerId?: string | null;
		reason?: string | null;
	}>;
};

type RoutingDiagnostics = {
	filterStages?: Array<{
		stage?: string;
		beforeCount?: number;
		afterCount?: number;
		droppedProviders?: Array<{
			providerId?: string | null;
			reason?: string | null;
		}>;
	}>;
};

type ProviderFailureDiagnostics = {
	category?: string;
	hint?: string;
	provider?: string | null;
};

type UpstreamErrorDiagnostics = {
	code?: string | null;
	message?: string | null;
	description?: string | null;
	param?: string | null;
};

type FailureSampleEntry = {
	provider?: string | null;
	status?: number | null;
	upstream_error_code?: string | null;
	upstream_error_message?: string | null;
	upstream_error_description?: string | null;
};

type ParsedGatewayError = {
	error?: string;
	description?: string;
	message?: string;
	reason?: string;
	status_code?: number;
	attempt_count?: number;
	failed_providers?: string[];
	failed_statuses?: number[];
	generation_id?: string;
	upstream_error?: UpstreamErrorDiagnostics;
	provider_candidate_diagnostics?: ProviderCandidateDiagnostics;
	provider_enablement?: ProviderEnablementDiagnostics;
	routing_diagnostics?: RoutingDiagnostics;
	provider_failure_diagnostics?: ProviderFailureDiagnostics;
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
	reason?: string;
	statusCode?: number;
	attemptCount?: number;
	failedProviders?: string[];
	failedStatuses?: number[];
	generationId?: string;
	upstreamError?: {
		code: string | null;
		message: string | null;
		description: string | null;
		param: string | null;
	};
	providerCandidateDiagnostics?: {
		totalProviders: number | null;
		supportsEndpointCount: number | null;
		candidateCount: number | null;
		droppedUnsupportedEndpoint: string[];
		droppedMissingAdapter: Array<{
			providerId: string | null;
			endpoint: string | null;
		}>;
	};
	providerEnablement?: {
		capability: string | null;
		providersBefore: string[];
		providersAfter: string[];
		dropped: Array<{
			providerId: string | null;
			reason: string | null;
		}>;
	};
	routingDiagnostics?: {
		filterStages: Array<{
			stage: string | null;
			beforeCount: number | null;
			afterCount: number | null;
			droppedProviders: Array<{
				providerId: string | null;
				reason: string | null;
			}>;
		}>;
	};
	providerFailureCategory?: string;
	providerFailureProvider?: string;
	failureSample?: Array<{
		provider: string | null;
		status: number | null;
		upstreamErrorCode: string | null;
		upstreamErrorMessage: string | null;
		upstreamErrorDescription: string | null;
	}>;
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

function hintFromUnsupportedDiagnostics(payload: ParsedGatewayError): string | undefined {
	const diagnostics = payload.provider_candidate_diagnostics;
	const providerEnablement = payload.provider_enablement;

	if (
		Array.isArray(providerEnablement?.dropped) &&
		providerEnablement.dropped.length > 0 &&
		providerEnablement.dropped.every((entry) => entry?.reason === "pricing_missing")
	) {
		return "A provider mapping exists for this endpoint, but pricing is not configured yet. Try another provider or model until pricing is enabled.";
	}

	if ((diagnostics?.totalProviders ?? 0) === 0) {
		return "No provider is currently routable for this model in this room. Try provider Auto or choose a model that supports this endpoint.";
	}

	if ((diagnostics?.supportsEndpointCount ?? 0) === 0) {
		return "This model is known in the gateway, but no provider currently supports this room endpoint. Try a model that matches the room type.";
	}

	if (
		(diagnostics?.candidateCount ?? 0) === 0 &&
		Array.isArray(diagnostics?.droppedMissingAdapter) &&
		diagnostics.droppedMissingAdapter.length > 0
	) {
		return "A provider mapping exists, but the gateway does not have an adapter for this endpoint yet.";
	}

	return "Try provider Auto, then retry with a model that supports this room endpoint.";
}

function hintFromRoutingDiagnostics(payload: ParsedGatewayError): string | undefined {
	const stages = Array.isArray(payload.routing_diagnostics?.filterStages)
		? payload.routing_diagnostics?.filterStages ?? []
		: [];
	if (!stages.length) return undefined;

	const terminalStage = stages.find(
		(stage) =>
			typeof stage?.afterCount === "number" &&
			stage.afterCount === 0 &&
			Array.isArray(stage.droppedProviders) &&
			stage.droppedProviders.length > 0
	);
	if (!terminalStage) return undefined;

	const reasons = (terminalStage.droppedProviders ?? [])
		.map((entry) => String(entry?.reason ?? "").trim())
		.filter(Boolean);
	if (!reasons.length) return undefined;

	if (
		reasons.every(
			(reason) => reason === "capability_status_internal_testing_requires_testing_mode"
		)
	) {
		return "This model/provider mapping exists, but the endpoint is internal-testing only right now and is not publicly routable in this room.";
	}

	if (
		reasons.every(
			(reason) =>
				reason === "provider_routing_status_disabled" ||
				reason === "model_routing_status_disabled" ||
				reason === "capability_status_disabled"
		)
	) {
		return "This model/provider mapping is known in the gateway, but routing is currently disabled for this endpoint.";
	}

	if (
		reasons.every(
			(reason) =>
				reason === "beta_requires_team_beta_channel" ||
				reason === "alpha_requires_beta_and_alpha_channels" ||
				reason === "provider_status_not_ready"
		)
	) {
		return "This provider exists for the model, but it is currently rollout-restricted for your workspace or channel.";
	}

	if (reasons.every((reason) => reason === "breaker_open")) {
		return "All matching providers are temporarily unhealthy or rate-protected right now. Retrying later may succeed.";
	}

	return undefined;
}

function hintForGatewayError(payload: ParsedGatewayError): string | undefined {
	const structuredFailureHint = payload.provider_failure_diagnostics?.hint?.trim();
	if (structuredFailureHint) return structuredFailureHint;
	const code = String(payload.error ?? "").trim().toLowerCase();
	if (code === "unsupported_model_or_endpoint") {
		return hintFromUnsupportedDiagnostics(payload);
	}
	const routingHint = hintFromRoutingDiagnostics(payload);
	if (routingHint) return routingHint;
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

function normalizeFailureSampleEntry(entry: FailureSampleEntry): {
	provider: string | null;
	status: number | null;
	upstreamErrorCode: string | null;
	upstreamErrorMessage: string | null;
	upstreamErrorDescription: string | null;
} {
	return {
		provider:
			typeof entry?.provider === "string" && entry.provider.trim()
				? entry.provider.trim()
				: null,
		status: typeof entry?.status === "number" ? entry.status : null,
		upstreamErrorCode:
			typeof entry?.upstream_error_code === "string" &&
			entry.upstream_error_code.trim()
				? entry.upstream_error_code.trim()
				: null,
		upstreamErrorMessage:
			typeof entry?.upstream_error_message === "string" &&
			entry.upstream_error_message.trim()
				? entry.upstream_error_message.trim()
				: null,
		upstreamErrorDescription:
			typeof entry?.upstream_error_description === "string" &&
			entry.upstream_error_description.trim()
				? entry.upstream_error_description.trim()
				: null,
	};
}

function normalizeCount(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

function normalizeNumberList(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (typeof item === "number" && Number.isFinite(item)) return item;
			if (typeof item === "string" && item.trim()) {
				const parsed = Number(item);
				return Number.isFinite(parsed) ? parsed : null;
			}
			return null;
		})
		.filter((item): item is number => item != null);
}

function normalizeUpstreamError(
	value: UpstreamErrorDiagnostics | undefined
): FormattedRoomError["upstreamError"] | undefined {
	if (!value) return undefined;
	const normalized = {
		code:
			typeof value.code === "string" && value.code.trim()
				? value.code.trim()
				: null,
		message:
			typeof value.message === "string" && value.message.trim()
				? value.message.trim()
				: null,
		description:
			typeof value.description === "string" && value.description.trim()
				? value.description.trim()
				: null,
		param:
			typeof value.param === "string" && value.param.trim()
				? value.param.trim()
				: null,
	};
	return normalized.code ||
		normalized.message ||
		normalized.description ||
		normalized.param
		? normalized
		: undefined;
}

function normalizeProviderCandidateDiagnostics(
	value: ProviderCandidateDiagnostics | undefined
): FormattedRoomError["providerCandidateDiagnostics"] | undefined {
	if (!value) return undefined;
	return {
		totalProviders: normalizeCount(value.totalProviders),
		supportsEndpointCount: normalizeCount(value.supportsEndpointCount),
		candidateCount: normalizeCount(value.candidateCount),
		droppedUnsupportedEndpoint: normalizeStringList(
			value.droppedUnsupportedEndpoint
		),
		droppedMissingAdapter: Array.isArray(value.droppedMissingAdapter)
			? value.droppedMissingAdapter.map((entry) => ({
					providerId:
						typeof entry?.providerId === "string" && entry.providerId.trim()
							? entry.providerId.trim()
							: null,
					endpoint:
						typeof entry?.endpoint === "string" && entry.endpoint.trim()
							? entry.endpoint.trim()
							: null,
			  }))
			: [],
	};
}

function normalizeProviderEnablement(
	value: ProviderEnablementDiagnostics | undefined
): FormattedRoomError["providerEnablement"] | undefined {
	if (!value) return undefined;
	return {
		capability:
			typeof value.capability === "string" && value.capability.trim()
				? value.capability.trim()
				: null,
		providersBefore: normalizeStringList(value.providersBefore),
		providersAfter: normalizeStringList(value.providersAfter),
		dropped: Array.isArray(value.dropped)
			? value.dropped.map((entry) => ({
					providerId:
						typeof entry?.providerId === "string" && entry.providerId.trim()
							? entry.providerId.trim()
							: null,
					reason:
						typeof entry?.reason === "string" && entry.reason.trim()
							? entry.reason.trim()
							: null,
			  }))
			: [],
	};
}

function normalizeRoutingDiagnostics(
	value: RoutingDiagnostics | undefined
): FormattedRoomError["routingDiagnostics"] | undefined {
	if (!value) return undefined;
	return {
		filterStages: Array.isArray(value.filterStages)
			? value.filterStages.map((stage) => ({
					stage:
						typeof stage?.stage === "string" && stage.stage.trim()
							? stage.stage.trim()
							: null,
					beforeCount: normalizeCount(stage?.beforeCount),
					afterCount: normalizeCount(stage?.afterCount),
					droppedProviders: Array.isArray(stage?.droppedProviders)
						? stage.droppedProviders.map((entry) => ({
								providerId:
									typeof entry?.providerId === "string" &&
									entry.providerId.trim()
										? entry.providerId.trim()
										: null,
								reason:
									typeof entry?.reason === "string" && entry.reason.trim()
										? entry.reason.trim()
										: null,
						  }))
						: [],
			  }))
			: [],
	};
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
		reason:
			typeof parsed.reason === "string" && parsed.reason.trim()
				? parsed.reason.trim()
				: undefined,
		statusCode:
			typeof parsed.status_code === "number" ? parsed.status_code : undefined,
		attemptCount:
			typeof parsed.attempt_count === "number" &&
			Number.isFinite(parsed.attempt_count)
				? parsed.attempt_count
				: undefined,
		failedProviders: normalizeStringList(parsed.failed_providers),
		failedStatuses: normalizeNumberList(parsed.failed_statuses),
		generationId:
			typeof parsed.generation_id === "string" && parsed.generation_id.trim()
				? parsed.generation_id.trim()
				: undefined,
		upstreamError: normalizeUpstreamError(parsed.upstream_error),
		providerCandidateDiagnostics: normalizeProviderCandidateDiagnostics(
			parsed.provider_candidate_diagnostics
		),
		providerEnablement: normalizeProviderEnablement(
			parsed.provider_enablement
		),
		routingDiagnostics: normalizeRoutingDiagnostics(
			parsed.routing_diagnostics
		),
		providerFailureCategory:
			typeof parsed.provider_failure_diagnostics?.category === "string" &&
			parsed.provider_failure_diagnostics.category.trim()
				? parsed.provider_failure_diagnostics.category.trim()
				: undefined,
		providerFailureProvider:
			typeof parsed.provider_failure_diagnostics?.provider === "string" &&
			parsed.provider_failure_diagnostics.provider.trim()
				? parsed.provider_failure_diagnostics.provider.trim()
				: undefined,
		failureSample: Array.isArray(parsed.failure_sample)
			? parsed.failure_sample.map(normalizeFailureSampleEntry)
			: undefined,
	};
}
