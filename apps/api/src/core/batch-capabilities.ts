export type BatchInputMode = "file" | "requests";
export type BatchProviderPreviewReadiness = "validated" | "experimental" | "blocked";
export type BatchProviderReconciliationMode = "provider_webhook_with_polling" | "polling";
export type BatchProviderSubmissionRecovery = "metadata_lookup" | "manual_review";
export type BatchEndpointSupport = {
	endpoint: string;
	mode: "native" | "translated";
};

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
	endpoints: BatchEndpointSupport[];
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
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
			{ endpoint: "/v1/completions", mode: "native" },
			{ endpoint: "/v1/moderations", mode: "native" },
			{ endpoint: "/v1/images/generations", mode: "native" },
			{ endpoint: "/v1/images/edits", mode: "native" },
			{ endpoint: "/v1/videos", mode: "native" },
		],
		notes: "Gateway requests are converted into a provider batch JSONL file before submission.",
	},
	{
		providerId: "ovhcloud",
		displayName: "OVHcloud AI Endpoints",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-batch-mode",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		],
		supportsMultipleModelsPerBatch: true,
		notes: "OpenAI-compatible Batch and Files API. JSONL files are limited to 200 MB and 50,000 unique custom_id rows; at most five batches may be in progress. Completion windows are 24h, 48h, or 72h and output/error files expire after 15 days.",
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
		endpoints: [
			{ endpoint: "/v1/messages", mode: "native" },
			{ endpoint: "/v1/chat/completions", mode: "translated" },
		],
		supportsMultipleModelsPerBatch: true,
	},
	{
		providerId: "scaleway",
		displayName: "Scaleway Generative APIs",
		nativeInputModes: ["file"],
		gatewayInputModes: [],
		documentationUrl: "https://www.scaleway.com/en/docs/generative-apis/how-to/use-batch-processing/",
		status: "planned",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [{ endpoint: "/v1/chat/completions", mode: "native" }],
		notes: "Native batches require an S3 Object Storage object URL as input_file_id; the bucket must be in the same Scaleway Project and grant scw-managed-genapi-batch GetObject/PutObject. The gateway cannot expose this until it has an owned S3 URL/file bridge. Scaleway limits files to 200 MB and 50,000 unique custom_id rows, requires one POST endpoint and model per file, supports only completion_window=24h, writes separate output/error JSONL objects, and applies a 50% batch discount.",
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
		endpoints: [
			{ endpoint: "/v1/generateContent", mode: "native" },
			{ endpoint: "/v1/chat/completions", mode: "translated" },
		],
		notes: "Gemini generateContent requests are submitted to the native Batch API. Inline requests must stay under 20 MB; file-backed jobs use JSONL through the Google Files API (up to 2 GB), target completion within 24 hours, are non-idempotent, and cost 50% of interactive inference. Google now also exposes a separate createEmbeddings Batch API; the gateway does not yet translate public embeddings batches into that distinct resource shape.",
	},
	{
		providerId: "google-vertex",
		displayName: "Google Vertex AI",
		nativeInputModes: ["file"],
		gatewayInputModes: [],
		documentationUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini",
		status: "planned",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [
			{ endpoint: "/v1/generateContent", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		],
		notes: "Vertex AI batch inference uses regional BatchPredictionJob/Gen AI batch resources with Google Cloud Storage or BigQuery input and output owned by the same Google Cloud project. The gateway cannot expose this safely until it has an ADC-authenticated GCS/BigQuery file bridge and regional job lifecycle adapter.",
	},
	{
		providerId: "google-vertex-eu",
		displayName: "Google Vertex AI EU",
		nativeInputModes: ["file"],
		gatewayInputModes: [],
		documentationUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini",
		status: "planned",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [
			{ endpoint: "/v1/generateContent", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		],
		notes: "Vertex AI batch inference is region-scoped and requires Google Cloud Storage or BigQuery resources compatible with the selected EU location and project. The gateway has no ADC-authenticated regional storage/job bridge, so EU batch submission remains explicitly blocked.",
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
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
			{ endpoint: "/v1/images/generations", mode: "native" },
			{ endpoint: "/v1/images/edits", mode: "native" },
			{ endpoint: "/v1/videos/generations", mode: "native" },
			{ endpoint: "/v1/videos", mode: "native" },
			{ endpoint: "/v1/videos/edits", mode: "native" },
			{ endpoint: "/v1/videos/extensions", mode: "native" },
		],
		supportsMultipleModelsPerBatch: true,
		notes: "Requests use xAI's create-batch and add-requests workflow, with paginated partial results and POST /batches/{id}:cancel. JSONL Files input is native but not exposed through gateway file mode. Production access returned 403 in the latest live matrix, so preview remains blocked. grok-4.5 is explicitly unsupported.",
	},
	{
		providerId: "mistral",
		displayName: "Mistral",
		nativeInputModes: ["file", "requests"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://docs.mistral.ai/studio/batch-processing",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
			{ endpoint: "/v1/fim/completions", mode: "native" },
			{ endpoint: "/v1/moderations", mode: "native" },
			{ endpoint: "/v1/chat/moderations", mode: "native" },
			{ endpoint: "/v1/ocr", mode: "native" },
			{ endpoint: "/v1/classifications", mode: "native" },
			{ endpoint: "/v1/chat/classifications", mode: "native" },
			{ endpoint: "/v1/conversations", mode: "native" },
			{ endpoint: "/v1/audio/transcriptions", mode: "native" },
		],
		notes: "Inline batches support fewer than 10,000 requests; file-backed batches support up to 1,000,000 requests and use Mistral Files with purpose=batch.",
	},
	{
		providerId: "mistral-eu",
		displayName: "Mistral EU",
		nativeInputModes: [],
		gatewayInputModes: [],
		documentationUrl: "https://docs.mistral.ai/inference/regional-inference",
		status: "planned",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [],
		notes: "Mistral explicitly excludes Batch and Files from regional endpoints.",
	},
	{
		providerId: "moonshotai",
		displayName: "Moonshot AI / Kimi",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://platform.kimi.ai/docs/guide/use-batch-api",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
		endpoints: [{ endpoint: "/v1/chat/completions", mode: "native" }],
		notes: "Native input is a non-empty JSONL file up to 100 MB. Gateway inline requests are converted to a purpose=batch file. Only kimi-k2.5 and kimi-k2.6 are supported, with one model per batch and a 12h–7d completion window.",
	},
	{
		providerId: "xiaomi",
		displayName: "Xiaomi MiMo",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/batch-api",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/responses", mode: "native" },
		],
		notes: "OpenAI-compatible Files and Batch APIs run on the separate AMS batch host. JSONL files are limited to 128 MB, completion_window is fixed at 24h, files are retained for 30 days, and batch inference is billed at 50% of real-time pricing. Only mimo-v2.6-pro and mimo-v2.6-flash are supported.",
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
		endpoints: [{ endpoint: "/v1/chat/completions", mode: "native" }],
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
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [{ endpoint: "/v1/chat/completions", mode: "native" }],
		supportsMultipleModelsPerBatch: true,
		notes: "Gateway requests are converted into a provider batch JSONL file before submission.",
	},
	{
		providerId: "alibaba-cloud",
		displayName: "Alibaba Cloud Model Studio",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://www.alibabacloud.com/help/en/model-studio/batch-interfaces-compatible-with-openai/",
		status: "active",
		previewReadiness: "experimental",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		],
		supportsMultipleModelsPerBatch: true,
		notes: "OpenAI-compatible Files and Batch lifecycle with purpose=batch JSONL input and a fixed 24h completion window. API keys and hosts are region-specific.",
	},
	{
		providerId: "nebius-token-factory",
		displayName: "Nebius Token Factory",
		nativeInputModes: [],
		gatewayInputModes: [],
		documentationUrl: "https://docs.tokenfactory.nebius.com/data-lab/batch-inference",
		status: "planned",
		previewReadiness: "blocked",
		reconciliationMode: "polling",
		submissionRecovery: "manual_review",
		endpoints: [],
		notes: "Nebius removed the legacy OpenAI-compatible /v1/batches routes from its current OpenAPI. Its live batch surface is Data Lab datasets plus operations, which requires a distinct dataset/operation adapter and is fixed to EU North 1. Files remain available for batch and fine-tuning artifacts, but are not sufficient to submit a current native batch.",
	},
	{
		providerId: "parasail",
		displayName: "Parasail",
		nativeInputModes: ["file"],
		gatewayInputModes: ["file", "requests"],
		documentationUrl: "https://docs.parasail.io/parasail-docs/batch/api-reference",
		status: "active",
		previewReadiness: "validated",
		reconciliationMode: "polling",
		submissionRecovery: "metadata_lookup",
		endpoints: [
			{ endpoint: "/v1/chat/completions", mode: "native" },
			{ endpoint: "/v1/embeddings", mode: "native" },
		],
		supportsMultipleModelsPerBatch: true,
		notes: "OpenAI-compatible JSONL Batch and Files API on the distinct https://api.saas.parasail.io/v1 host. Standard files allow 50,000 rows and 100 MB. Parasail's separate 500 MB batch image generation/editing format is intentionally not exposed until its custom image-row schema has a dedicated gateway adapter.",
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
	if (trimmed === "moonshot-ai" || trimmed === "moonshot-ai-turbo" || trimmed === "moonshotai-turbo") return "moonshotai";
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
		case "moonshotai":
		case "moonshot-ai":
			return "moonshotai";
		case "xiaomi":
			return "xiaomi";
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
	if (slug.startsWith("kimi-") || slug.startsWith("moonshot-v1-")) return ["moonshotai"];
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
	const normalized = normalizeProviderId(providerId);
	return normalized ? CAPABILITIES_BY_PROVIDER.get(normalized) ?? null : null;
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
