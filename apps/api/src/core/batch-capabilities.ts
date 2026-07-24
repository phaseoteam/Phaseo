export type BatchInputMode = "file" | "requests";
export type BatchProviderPreviewReadiness = "validated" | "experimental" | "blocked";
export type BatchProviderReconciliationMode = "provider_webhook_with_polling" | "polling";
export type BatchProviderSubmissionRecovery = "metadata_lookup" | "manual_review";

export type BatchProviderCapability = {
	providerId: string;
	displayName: string;
	nativeInputModes: BatchInputMode[];
	gatewayInputModes: BatchInputMode[];
	documentationUrl: string;
	status: "planned" | "active";
	previewReadiness: BatchProviderPreviewReadiness;
	reconciliationMode: BatchProviderReconciliationMode;
	submissionRecovery: BatchProviderSubmissionRecovery;
	supportsMultipleModelsPerBatch?: boolean;
	notes?: string;
};

export type BatchInputModeResolution =
	| { ok: true; mode: BatchInputMode }
	| { ok: false; reason: "missing_batch_input" | "ambiguous_batch_input" | "invalid_requests" };

export const BATCH_PROVIDER_CAPABILITIES: BatchProviderCapability[] = [
	{
		providerId: "openai",
		displayName: "OpenAI",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://platform.openai.com/docs/guides/batch",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "provider_webhook_with_polling",
		submissionRecovery: "metadata_lookup",
		notes: "Gateway requests are converted into a provider batch JSONL file before submission.",
	},
	{
		providerId: "anthropic",
		displayName: "Anthropic",
		nativeInputModes: ["requests"],
		gatewayInputModes: ["requests"],
		documentationUrl: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		supportsMultipleModelsPerBatch: true,
	},
	{
		providerId: "google-ai-studio",
		displayName: "Google Gemini",
		nativeInputModes: ["file", "requests"],
		gatewayInputModes: ["requests"],
		documentationUrl: "https://ai.google.dev/gemini-api/docs/batch-api",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "provider_webhook_with_polling",
		submissionRecovery: "metadata_lookup",
		notes: "Gemini requests are submitted to the native Batch API. File-backed Gemini batches require Google Files API integration.",
	},
	{
		providerId: "x-ai",
		displayName: "xAI",
		nativeInputModes: ["file", "requests"],
		gatewayInputModes: ["requests"],
		documentationUrl: "https://docs.x.ai/developers/advanced-api-usage/batch-api",
		status: "active",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
		supportsMultipleModelsPerBatch: true,
		notes: "Requests use xAI's create-batch and add-requests workflow. Production access returned 403 in the latest live matrix.",
	},
	{
		providerId: "mistral",
		displayName: "Mistral",
		nativeInputModes: ["file", "requests"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://docs.mistral.ai/studio-api/batch-processing",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
	},
	{
		providerId: "groq",
		displayName: "Groq",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://console.groq.com/docs/batch",
		status: "active",
		previewReadiness: "experimental",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		supportsMultipleModelsPerBatch: true,
		notes: "Gateway requests are converted into a provider batch JSONL file before submission.",
	},
	{
		providerId: "together",
		displayName: "Together AI",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://docs.together.ai/docs/inference/batch/overview",
		status: "active",
		previewReadiness: "experimental",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		supportsMultipleModelsPerBatch: true,
		notes: "Gateway requests are converted into a provider batch JSONL file before submission.",
	},
];

const CAPABILITIES_BY_PROVIDER = new Map(
	BATCH_PROVIDER_CAPABILITIES.map((capability) => [capability.providerId, capability]),
);

export function resolveBatchPreviewProviderIds(value: unknown): string[] {
	const configured = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (!configured) return ["openai"];
	if (configured === "*") {
		return BATCH_PROVIDER_CAPABILITIES
			.filter((capability) => capability.status === "active" && capability.previewReadiness === "validated")
			.map((capability) => capability.providerId);
	}
	const requested = configured
		.split(",")
		.map((providerId) => providerId.trim())
		.filter(Boolean)
		.map((providerId) => normalizeProviderId(providerId))
		.filter((providerId): providerId is string => Boolean(providerId));
	const knownActive = requested.filter((providerId) => {
		const capability = getBatchProviderCapability(providerId);
		return capability?.status === "active" && capability.previewReadiness === "validated";
	});
	return [...new Set(knownActive)];
}

export function isBatchProviderPreviewEnabled(providerId: string, value: unknown): boolean {
	return resolveBatchPreviewProviderIds(value).includes(normalizeProviderId(providerId) ?? "");
}

function normalizeProviderId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;
	if (trimmed === "google" || trimmed === "gemini") return "google-ai-studio";
	if (trimmed === "xai") return "x-ai";
	if (trimmed === "together-ai" || trimmed === "togetherai") return "together";
	return trimmed;
}

function normalizeModelId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function providerFromModelPrefix(model: string): string | null {
	const lower = model.toLowerCase();
	const prefix = lower.includes("/") ? lower.split("/", 1)[0] : null;
	switch (prefix) {
		case "openai":
			return "openai";
		case "anthropic":
			return "anthropic";
		case "google":
		case "gemini":
			return "google-ai-studio";
		case "mistral":
			return "mistral";
		case "x-ai":
		case "xai":
		case "spacex-ai":
			return "x-ai";
		case "groq":
			return "groq";
		case "together":
		case "together-ai":
			return "together";
		default:
			return null;
	}
}

export function resolveBatchProvidersFromModel(model: unknown): string[] {
	const text = normalizeModelId(model);
	if (!text) return [];
	const lower = text.toLowerCase();
	const prefixed = providerFromModelPrefix(lower);
	if (prefixed) return [prefixed];
	const slug = lower.startsWith("models/") ? lower.slice("models/".length) : lower;
	if (
		slug.startsWith("gpt-") ||
		slug.startsWith("o1") ||
		slug.startsWith("o3") ||
		slug.startsWith("o4") ||
		slug.startsWith("chatgpt-") ||
		slug.startsWith("codex-") ||
		slug.startsWith("computer-use-") ||
		slug.startsWith("text-embedding-") ||
		slug.startsWith("whisper-") ||
		slug.startsWith("omni-moderation")
	) {
		return ["openai"];
	}
	if (slug.startsWith("claude-")) return ["anthropic"];
	if (slug.startsWith("gemini-")) return ["google-ai-studio"];
	if (
		slug.startsWith("mistral-") ||
		slug.startsWith("codestral-") ||
		slug.startsWith("ministral-") ||
		slug.startsWith("pixtral-") ||
		slug.startsWith("devstral-") ||
		slug.startsWith("magistral-") ||
		slug.startsWith("open-mistral-") ||
		slug.startsWith("open-mixtral-")
	) {
		return ["mistral"];
	}
	if (slug.startsWith("grok-")) return ["x-ai"];
	if (
		slug.endsWith("-versatile") ||
		slug.endsWith("-instant") ||
		slug.includes("-32768") ||
		slug === "gemma2-9b-it"
	) {
		return ["groq"];
	}
	if (
		slug.startsWith("meta-llama/") ||
		slug.startsWith("mistralai/") ||
		slug.startsWith("deepseek-ai/") ||
		slug.startsWith("qwen/") ||
		slug.includes("-turbo")
	) {
		return ["together"];
	}
	return [];
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
	const batchRequests = Array.isArray(payload.requests) ? payload.requests : null;
	const promptRequests = Array.isArray(payload.prompts) ? payload.prompts : null;
	const itemRequests = Array.isArray(payload.items) ? payload.items : null;
	const requestSourceCount = [batchRequests, promptRequests, itemRequests].filter(Boolean).length;
	const hasRequests = requestSourceCount > 0;
	if (hasFile && hasRequests) return { ok: false, reason: "ambiguous_batch_input" };
	if (requestSourceCount > 1) return { ok: false, reason: "ambiguous_batch_input" };
	if (hasFile) return { ok: true, mode: "file" };
	if (batchRequests) {
		return batchRequests.length > 0
			? { ok: true, mode: "requests" }
			: { ok: false, reason: "invalid_requests" };
	}
	if (promptRequests) {
		return promptRequests.length > 0
			? { ok: true, mode: "requests" }
			: { ok: false, reason: "invalid_requests" };
	}
	if (itemRequests) {
		return itemRequests.length > 0
			? { ok: true, mode: "requests" }
			: { ok: false, reason: "invalid_requests" };
	}
	return { ok: false, reason: "missing_batch_input" };
}

export function getBatchProviderCapability(providerId: string): BatchProviderCapability | null {
	return CAPABILITIES_BY_PROVIDER.get(providerId.trim().toLowerCase()) ?? null;
}

export function providerSupportsMultipleModelsPerBatch(providerId: string): boolean {
	return getBatchProviderCapability(providerId)?.supportsMultipleModelsPerBatch === true;
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
			message: `No requested batch provider supports ${args.mode} batch input through Phaseo yet.`,
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
