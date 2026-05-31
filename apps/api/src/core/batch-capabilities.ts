export type BatchInputMode = "file" | "inline";

export type BatchProviderCapability = {
	providerId: string;
	displayName: string;
	nativeInputModes: BatchInputMode[];
	gatewayInputModes: BatchInputMode[];
	documentationUrl: string;
	status: "planned" | "active";
	notes?: string;
};

export type BatchInputModeResolution =
	| { ok: true; mode: BatchInputMode }
	| { ok: false; reason: "missing_batch_input" | "ambiguous_batch_input" | "invalid_inline_requests" };

export const BATCH_PROVIDER_CAPABILITIES: BatchProviderCapability[] = [
	{
		providerId: "openai",
		displayName: "OpenAI",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "inline"],
		documentationUrl: "https://platform.openai.com/docs/guides/batch",
		status: "active",
		notes: "Inline gateway requests are converted into a provider batch JSONL file before submission.",
	},
	{
		providerId: "anthropic",
		displayName: "Anthropic",
		nativeInputModes: ["inline"],
		gatewayInputModes: ["inline"],
		documentationUrl: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing",
		status: "planned",
	},
	{
		providerId: "google",
		displayName: "Google Gemini",
		nativeInputModes: ["file", "inline"],
		gatewayInputModes: ["file", "inline"],
		documentationUrl: "https://ai.google.dev/gemini-api/docs/batch-mode",
		status: "planned",
	},
	{
		providerId: "x-ai",
		displayName: "xAI",
		nativeInputModes: ["file", "inline"],
		gatewayInputModes: ["file", "inline"],
		documentationUrl: "https://docs.x.ai/docs/guides/batch-api",
		status: "planned",
	},
];

const CAPABILITIES_BY_PROVIDER = new Map(
	BATCH_PROVIDER_CAPABILITIES.map((capability) => [capability.providerId, capability]),
);

function normalizeProviderId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	return trimmed.length > 0 ? trimmed : null;
}

function toProviderIds(value: unknown): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	const record = value as Record<string, unknown>;
	const candidates = [
		record.id,
		record.provider,
		record.only,
		record.preferred,
		record.order,
		record.allow,
		record.providers,
		record.include,
	];
	const out: string[] = [];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			for (const item of candidate) {
				const normalized = normalizeProviderId(item);
				if (normalized) out.push(normalized);
			}
			continue;
		}
		const normalized = normalizeProviderId(candidate);
		if (normalized) out.push(normalized);
	}
	return [...new Set(out)];
}

export function resolveRequestedBatchProviders(provider: unknown): string[] {
	const direct = normalizeProviderId(provider);
	if (direct) return [direct];
	const fromObject = toProviderIds(provider);
	if (fromObject.length > 0) return fromObject;
	return BATCH_PROVIDER_CAPABILITIES.map((capability) => capability.providerId);
}

export function resolveBatchInputMode(payload: Record<string, unknown>): BatchInputModeResolution {
	const hasFile = typeof payload.input_file_id === "string" && payload.input_file_id.trim().length > 0;
	const inlineRequests = Array.isArray(payload.requests) ? payload.requests : null;
	const hasInlineRequests = Boolean(inlineRequests);
	if (hasFile && hasInlineRequests) return { ok: false, reason: "ambiguous_batch_input" };
	if (hasFile) return { ok: true, mode: "file" };
	if (inlineRequests) {
		return inlineRequests.length > 0
			? { ok: true, mode: "inline" }
			: { ok: false, reason: "invalid_inline_requests" };
	}
	return { ok: false, reason: "missing_batch_input" };
}

export function getBatchProviderCapability(providerId: string): BatchProviderCapability | null {
	return CAPABILITIES_BY_PROVIDER.get(providerId.trim().toLowerCase()) ?? null;
}

export function listBatchProviderCapabilities(mode?: BatchInputMode): BatchProviderCapability[] {
	if (!mode) return [...BATCH_PROVIDER_CAPABILITIES];
	return BATCH_PROVIDER_CAPABILITIES.filter((capability) => capability.gatewayInputModes.includes(mode));
}

export function resolveBatchProvidersForMode(args: {
	mode: BatchInputMode;
	requestedProviders?: string[];
	activeOnly?: boolean;
}): BatchProviderCapability[] {
	const requested = new Set(
		(args.requestedProviders && args.requestedProviders.length > 0
			? args.requestedProviders
			: BATCH_PROVIDER_CAPABILITIES.map((capability) => capability.providerId)
		).map((providerId) => providerId.trim().toLowerCase()),
	);
	return BATCH_PROVIDER_CAPABILITIES.filter((capability) => {
		if (!requested.has(capability.providerId)) return false;
		if (args.activeOnly && capability.status !== "active") return false;
		return capability.gatewayInputModes.includes(args.mode);
	});
}

export function buildUnsupportedBatchModePayload(args: {
	mode: BatchInputMode;
	requestedProviders: string[];
}): Record<string, unknown> {
	const knownRequested = args.requestedProviders
		.map((providerId) => getBatchProviderCapability(providerId))
		.filter((capability): capability is BatchProviderCapability => Boolean(capability));
	const providers = knownRequested.length > 0 ? knownRequested : BATCH_PROVIDER_CAPABILITIES;
	return {
		error: {
			type: "validation_error",
			reason: "batch_input_mode_not_supported",
			message: `No requested batch provider supports ${args.mode} batch input through AI Stats yet.`,
			input_mode: args.mode,
			requested_providers: args.requestedProviders,
			providers: providers.map((capability) => ({
				id: capability.providerId,
				name: capability.displayName,
				gateway_input_modes: capability.gatewayInputModes,
				native_input_modes: capability.nativeInputModes,
				status: capability.status,
				documentation_url: capability.documentationUrl,
			})),
		},
	};
}
