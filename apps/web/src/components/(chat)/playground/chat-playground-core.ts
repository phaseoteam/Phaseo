import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type {
	ChatMessage,
	ChatModelSettings,
	ChatSettings,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";

export const DEFAULT_SETTINGS: ChatSettings = {
	temperature: null,
	maxOutputTokens: null,
	topP: null,
	topK: null,
	minP: null,
	topA: null,
	presencePenalty: null,
	frequencyPenalty: null,
	repetitionPenalty: null,
	seed: null,
	systemPrompt: "",
	stream: true,
	providerId: "auto",
	reasoningEnabled: false,
	reasoningEffort: "medium",
	endpoint: "responses",
	webSearchEnabled: false,
	imageOutputEnabled: false,
	compareMode: false,
	compareModelIds: [],
	modelOverridesById: {},
};

const MODEL_SETTING_KEYS: Array<keyof ChatModelSettings> = [
	"temperature",
	"maxOutputTokens",
	"topP",
	"topK",
	"minP",
	"topA",
	"presencePenalty",
	"frequencyPenalty",
	"repetitionPenalty",
	"seed",
	"systemPrompt",
	"stream",
	"providerId",
	"reasoningEnabled",
	"reasoningEffort",
	"endpoint",
	"webSearchEnabled",
	"imageOutputEnabled",
	"enabled",
	"displayName",
];

export type SettingChange = {
	label: string;
	value: string;
};

const formatSettingValue = (value: unknown, fallback = "Default") => {
	if (value == null || value === "") return fallback;
	if (typeof value === "boolean") return value ? "On" : "Off";
	if (typeof value === "number") return String(value);
	return String(value);
};

export const getChangedSettings = (
	settings: ChatSettings,
	modelId: string,
): SettingChange[] => {
	const defaults: ChatSettings = {
		...DEFAULT_SETTINGS,
		systemPrompt: buildDefaultSystemPrompt(modelId),
	};
	const changes: SettingChange[] = [];
	const addChange = (label: string, value: string) => {
		changes.push({ label, value });
	};
	if (settings.temperature !== defaults.temperature) {
		addChange("Temperature", formatSettingValue(settings.temperature));
	}
	if (settings.maxOutputTokens !== defaults.maxOutputTokens) {
		addChange(
			"Max output tokens",
			formatSettingValue(settings.maxOutputTokens),
		);
	}
	if (settings.topP !== defaults.topP) {
		addChange("Top P", formatSettingValue(settings.topP));
	}
	if (settings.topK !== defaults.topK) {
		addChange("Top K", formatSettingValue(settings.topK));
	}
	if (settings.minP !== defaults.minP) {
		addChange("Min P", formatSettingValue(settings.minP));
	}
	if (settings.topA !== defaults.topA) {
		addChange("Top A", formatSettingValue(settings.topA));
	}
	if (settings.frequencyPenalty !== defaults.frequencyPenalty) {
		addChange(
			"Frequency penalty",
			formatSettingValue(settings.frequencyPenalty),
		);
	}
	if (settings.presencePenalty !== defaults.presencePenalty) {
		addChange(
			"Presence penalty",
			formatSettingValue(settings.presencePenalty),
		);
	}
	if (settings.repetitionPenalty !== defaults.repetitionPenalty) {
		addChange(
			"Repetition penalty",
			formatSettingValue(settings.repetitionPenalty),
		);
	}
	if (settings.seed !== defaults.seed) {
		addChange("Seed", formatSettingValue(settings.seed));
	}
	if (settings.stream !== defaults.stream) {
		addChange("Streaming", formatSettingValue(settings.stream, "Off"));
	}
	if (settings.providerId !== defaults.providerId) {
		addChange("Provider", formatSettingValue(settings.providerId, "Auto"));
	}
	if (settings.reasoningEnabled !== defaults.reasoningEnabled) {
		addChange(
			"Reasoning",
			formatSettingValue(settings.reasoningEnabled, "Off"),
		);
	}
	if (settings.reasoningEffort !== defaults.reasoningEffort) {
		addChange(
			"Reasoning effort",
			formatSettingValue(settings.reasoningEffort),
		);
	}
	if (
		(settings.systemPrompt ?? "").trim() !==
		(defaults.systemPrompt ?? "").trim()
	) {
		addChange("System prompt", "Custom");
	}
	return changes;
};

export const STORAGE_KEYS = {
	apiKey: "ai-stats-chat-api-key",
	baseUrl: "ai-stats-chat-base-url",
	activeChatId: "ai-stats-chat-active-id",
	lastModelId: "ai-stats-chat-last-model-id",
	personalizationName: "ai-stats-chat-personal-name",
	personalizationRole: "ai-stats-chat-personal-role",
	personalizationNotes: "ai-stats-chat-personal-notes",
	personalizationAccent: "ai-stats-chat-personal-accent",
	debugMode: "ai-stats-chat-debug",
};

export const generateId = () => {
	if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const APP_HEADERS = {
	"x-title": "AI Stats Chat",
	"http-referer": "https://ai-stats.phaseo.app/chat",
};

export const TEMP_CHAT_ID = "temp-chat";

export type PersonalizationSettings = {
	name: string;
	role: string;
	notes: string;
	accentColor: string;
};

export function nowIso() {
	return new Date().toISOString();
}

export function buildTitle(messages: ChatMessage[]) {
	const first = messages.find((msg) => msg.role === "user");
	if (!first) return "New chat";
	return first.content.trim().slice(0, 48) || "New chat";
}

export function buildPersonalizationPrompt(
	personalization: PersonalizationSettings,
) {
	const lines = [];
	if (personalization.name.trim()) {
		lines.push(`Name: ${personalization.name.trim()}`);
	}
	if (personalization.role.trim()) {
		lines.push(`Role: ${personalization.role.trim()}`);
	}
	if (personalization.notes.trim()) {
		lines.push(`Notes: ${personalization.notes.trim()}`);
	}
	if (!lines.length) return "";
	return `User profile:\n${lines.join("\n")}`;
}

export function extractTotalCostUsd(usage: Record<string, unknown> | null) {
	if (!usage) return null;
	const pricing =
		(usage as any).pricing_breakdown ?? (usage as any).pricing ?? null;
	if (!pricing) return null;
	if (typeof pricing.total_usd_str === "string") {
		return pricing.total_usd_str;
	}
	if (typeof pricing.total_nanos === "number") {
		return (pricing.total_nanos / 1e9).toFixed(7);
	}
	return null;
}

export function normalizeBaseUrl(baseUrl: string) {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	return trimmed || BASE_URL;
}

export function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

export function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

export function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function normalizeNickname(nickname?: string | null) {
	if (!nickname) return "";
	return nickname.trim();
}

export function buildDefaultSystemPrompt(
	modelId: string,
	nickname?: string | null,
) {
	const safeModelId = modelId || "AI model";
	const orgLabel = formatOrgLabel(getOrgId(safeModelId));
	const normalizedNickname = normalizeNickname(nickname);
	const identityLine = normalizedNickname
		? `You are ${safeModelId}, known as: ${normalizedNickname}, a large language model from ${orgLabel}.`
		: `You are ${safeModelId}, a large language model from ${orgLabel}.`;
	return [
		identityLine,
		"",
		"Formatting Rules:",
		"- Use Markdown for lists, tables, and styling.",
		"- Use ```code fences``` for all code blocks.",
		"- Format file names, paths, and function names with `inline code` backticks.",
		"- **For all mathematical expressions, you must use dollar-sign delimiters. Use $...$ for inline math and $$...$$ for block math. Do not use (...) or [...] delimiters.**",
	].join("\n");
}

export function shouldRequestImageModalities(modelId: string) {
	if (!modelId) return false;
	const normalized = modelId.toLowerCase();
	return normalized.includes("gemini") && normalized.includes("image");
}

export function pickModelSettings(
	settings: Partial<ChatSettings>,
): Partial<ChatModelSettings> {
	const picked: Partial<ChatModelSettings> = {};
	for (const key of MODEL_SETTING_KEYS) {
		const value = settings[key];
		if (value !== undefined) {
			(picked as Record<string, unknown>)[key] = value;
		}
	}
	return picked;
}

export function getEffectiveModelSettings(
	thread: ChatThread,
	modelId: string,
): ChatModelSettings {
	const modelDisplayName =
		thread.settings.modelOverridesById?.[modelId]?.displayName ?? "";
	const defaults: ChatModelSettings = {
		temperature: DEFAULT_SETTINGS.temperature,
		maxOutputTokens: DEFAULT_SETTINGS.maxOutputTokens,
		topP: DEFAULT_SETTINGS.topP,
		topK: DEFAULT_SETTINGS.topK,
		minP: DEFAULT_SETTINGS.minP,
		topA: DEFAULT_SETTINGS.topA,
		presencePenalty: DEFAULT_SETTINGS.presencePenalty,
		frequencyPenalty: DEFAULT_SETTINGS.frequencyPenalty,
		repetitionPenalty: DEFAULT_SETTINGS.repetitionPenalty,
		seed: DEFAULT_SETTINGS.seed,
		systemPrompt: buildDefaultSystemPrompt(modelId, modelDisplayName),
		stream: DEFAULT_SETTINGS.stream,
		providerId: DEFAULT_SETTINGS.providerId,
		reasoningEnabled: DEFAULT_SETTINGS.reasoningEnabled,
		reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
		endpoint: DEFAULT_SETTINGS.endpoint,
		webSearchEnabled: DEFAULT_SETTINGS.webSearchEnabled,
		imageOutputEnabled: DEFAULT_SETTINGS.imageOutputEnabled,
		enabled: true,
		displayName: "",
	};
	const globalModelSettings = pickModelSettings(thread.settings);
	const modelOverrides = pickModelSettings(
		thread.settings.modelOverridesById?.[modelId] ?? {},
	);
	return {
		...defaults,
		...globalModelSettings,
		...modelOverrides,
	};
}

export function ensureModelOverridesForIds(
	settings: ChatSettings,
	modelIds: string[],
): Record<string, Partial<ChatModelSettings>> {
	const currentOverrides = settings.modelOverridesById ?? {};
	let nextOverrides: Record<string, Partial<ChatModelSettings>> | null = null;
	for (const modelId of modelIds) {
		if (!modelId) continue;
		const existingOverride = currentOverrides[modelId];
		if (existingOverride && "systemPrompt" in existingOverride) continue;
		if (!nextOverrides) {
			nextOverrides = { ...currentOverrides };
		}
		nextOverrides[modelId] = {
			...(existingOverride ?? {}),
			systemPrompt: buildDefaultSystemPrompt(
				modelId,
				existingOverride?.displayName,
			),
		};
	}
	return nextOverrides ?? currentOverrides;
}

export function ensureVariants(message: ChatMessage) {
	if (message.variants && message.variants.length > 0) {
		return message.variants;
	}
	return [
		{
			id: message.id,
			content: message.content,
			createdAt: message.createdAt,
			usage: message.usage ?? null,
			meta: message.meta ?? null,
		},
	];
}

export type ModelOption = {
	modelId: string;
	orgId: string;
	orgName: string;
	label: string;
	capabilityEndpoints: UnifiedChatEndpoint[];
	providerIds: string[];
	providerNames: string[];
	providerAvailability: Record<string, boolean>;
	releaseDate: string | null;
	gatewayStatus: "active" | "inactive";
};

export const PENDING_STATUSES = new Set([
	"queued",
	"pending",
	"running",
	"processing",
	"in_progress",
	"created",
]);

export const COMPLETED_STATUSES = new Set([
	"completed",
	"succeeded",
	"success",
	"finished",
	"ready",
]);

export function wait(ms: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

export function normalizeGenerationStatus(payload: any): string | null {
	const candidates = [
		payload?.status,
		payload?.state,
		payload?.video?.status,
		payload?.data?.status,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim().toLowerCase();
		}
	}
	return null;
}

export function extractGenerationResourceId(payload: any): string | null {
	const candidates = [
		payload?.id,
		payload?.resource_id,
		payload?.video_id,
		payload?.video?.id,
		payload?.data?.id,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

export function extractUnifiedMediaUrl(payload: any): string | null {
	const directCandidates = [
		payload?.url,
		payload?.video_url,
		payload?.audio_url,
		payload?.content_url,
		payload?.result_url,
		payload?.video?.url,
		payload?.data?.url,
	];
	for (const value of directCandidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	if (Array.isArray(payload?.data)) {
		for (const entry of payload.data) {
			if (typeof entry?.url === "string" && entry.url.trim()) {
				return entry.url.trim();
			}
		}
	}
	return null;
}

export function getEndpointResultLabel(endpoint: UnifiedChatEndpoint) {
	switch (endpoint) {
		case "audio.speech":
			return "Open generated audio";
		case "video.generation":
			return "Open generated video";
		case "music.generate":
			return "Open generated music";
		case "images.generations":
			return "Open generated image";
		default:
			return "Open result";
	}
}

export function isModelExpired(
	model: Pick<GatewaySupportedModel, "effectiveTo">,
	nowMs = Date.now(),
): boolean {
	if (!model.effectiveTo) return false;
	const effectiveToMs = Date.parse(model.effectiveTo);
	if (!Number.isFinite(effectiveToMs)) return false;
	return effectiveToMs <= nowMs;
}
