import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import {
	getRoomScopedStorageKey,
	type ChatRoomId,
} from "@/lib/chat/rooms";
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
	apiServerToolsEnabled: false,
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
	"apiServerToolsEnabled",
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

export function getRoomStorageKeys(roomId: ChatRoomId) {
	return {
		apiKey: getRoomScopedStorageKey(roomId, "api-key"),
		baseUrl: getRoomScopedStorageKey(roomId, "base-url"),
		activeChatId: getRoomScopedStorageKey(roomId, "active-id"),
		lastModelId: getRoomScopedStorageKey(roomId, "last-model-id"),
		personalizationName: getRoomScopedStorageKey(roomId, "personal-name"),
		personalizationRole: getRoomScopedStorageKey(roomId, "personal-role"),
		personalizationNotes: getRoomScopedStorageKey(roomId, "personal-notes"),
		personalizationTheme: getRoomScopedStorageKey(roomId, "personal-theme"),
		personalizationFont: getRoomScopedStorageKey(roomId, "personal-font"),
		personalizationAccent: getRoomScopedStorageKey(roomId, "personal-accent"),
		notifyOnComplete: getRoomScopedStorageKey(roomId, "notify-on-complete"),
		debugMode: getRoomScopedStorageKey(roomId, "debug"),
	};
}

export const STORAGE_KEYS = getRoomStorageKeys("text");

export const PERSONALIZATION_ACCENT_COLORS: Array<{
	label: string;
	value: string;
}> = [
	{ label: "Ink", value: "#111111" },
	{ label: "Forest", value: "#166534" },
	{ label: "Cobalt", value: "#2563eb" },
	{ label: "Teal", value: "#0f766e" },
	{ label: "Emerald", value: "#059669" },
	{ label: "Amber", value: "#d97706" },
	{ label: "Rose", value: "#e11d48" },
	{ label: "Violet", value: "#7c3aed" },
];

export type PersonalizationThemePresetId =
	| "custom"
	| "chatgpt"
	| "claude"
	| "gemini";

export type PersonalizationFontFamilyId =
	| "system"
	| "chatgpt"
	| "claude"
	| "gemini";

export type PersonalizationThemePreset = {
	id: PersonalizationThemePresetId;
	label: string;
	description: string;
	defaultAccentColor: string;
	defaultFontFamily: PersonalizationFontFamilyId;
	appBackground: string;
	sidebarBackground: string;
	sidebarBorder: string;
	headerBackground: string;
	headerBorder: string;
	canvasBackground: string;
	composerBackground: string;
	composerBorder: string;
	assistantBubbleBackground: string;
	assistantBubbleBorder: string;
	assistantBubbleText: string;
	textColor: string;
};

export type PersonalizationFontFamily = {
	id: PersonalizationFontFamilyId;
	label: string;
	value: string;
};

export type ResolvedChatroomTheme = {
	presetId: PersonalizationThemePresetId;
	presetLabel: string;
	presetDescription: string;
	fontFamilyId: PersonalizationFontFamilyId;
	fontFamilyLabel: string;
	fontFamilyValue: string;
	accentColor: string;
	appBackground: string;
	sidebarBackground: string;
	sidebarBorder: string;
	headerBackground: string;
	headerBorder: string;
	canvasBackground: string;
	composerBackground: string;
	composerBorder: string;
	assistantBubbleBackground: string;
	assistantBubbleBorder: string;
	assistantBubbleText: string;
	userBubbleText: string;
	textColor: string;
};

export const DEFAULT_PERSONALIZATION_THEME_PRESET: PersonalizationThemePresetId =
	"custom";
export const DEFAULT_PERSONALIZATION_FONT_FAMILY: PersonalizationFontFamilyId =
	"system";

export const PERSONALIZATION_CHAT_THEME_PRESETS: PersonalizationThemePreset[] = [
	{
		id: "custom",
		label: "Custom",
		description: "Clean white canvas with your chosen accent color.",
		defaultAccentColor: "#111111",
		defaultFontFamily: "system",
		appBackground: "#ffffff",
		sidebarBackground: "#ffffff",
		sidebarBorder: "#e2e8f0",
		headerBackground: "#ffffff",
		headerBorder: "#e2e8f0",
		canvasBackground: "#ffffff",
		composerBackground: "#ffffff",
		composerBorder: "#dbe4ee",
		assistantBubbleBackground: "#eef2f7",
		assistantBubbleBorder: "#d5dde8",
		assistantBubbleText: "#0f172a",
		textColor: "#0f172a",
	},
	{
		id: "chatgpt",
		label: "ChatGPT",
		description: "Dark slate layout with green accent highlights.",
		defaultAccentColor: "#10a37f",
		defaultFontFamily: "chatgpt",
		appBackground: "#202123",
		sidebarBackground: "#171717",
		sidebarBorder: "#2b2d31",
		headerBackground: "#202123",
		headerBorder: "#303236",
		canvasBackground: "#202123",
		composerBackground: "#2f3033",
		composerBorder: "#3a3c40",
		assistantBubbleBackground: "#2b2d31",
		assistantBubbleBorder: "#3a3c40",
		assistantBubbleText: "#ececf1",
		textColor: "#ececf1",
	},
	{
		id: "claude",
		label: "Claude",
		description: "Warm paper tones with calm earthy contrast.",
		defaultAccentColor: "#c4684a",
		defaultFontFamily: "claude",
		appBackground: "#f7f3ea",
		sidebarBackground: "#f3eee3",
		sidebarBorder: "#ded2c3",
		headerBackground: "#f8f4ea",
		headerBorder: "#ded2c3",
		canvasBackground: "#fbf7ee",
		composerBackground: "#fffdf8",
		composerBorder: "#dccfbe",
		assistantBubbleBackground: "#efe6d8",
		assistantBubbleBorder: "#d8ccb9",
		assistantBubbleText: "#2f261d",
		textColor: "#2f261d",
	},
	{
		id: "gemini",
		label: "Gemini",
		description: "Cool airy blues with crisp card surfaces.",
		defaultAccentColor: "#4285f4",
		defaultFontFamily: "gemini",
		appBackground: "#eef3ff",
		sidebarBackground: "#e6edff",
		sidebarBorder: "#c9d8ff",
		headerBackground: "#f5f8ff",
		headerBorder: "#c9d8ff",
		canvasBackground: "#f4f8ff",
		composerBackground: "#ffffff",
		composerBorder: "#c8d8ff",
		assistantBubbleBackground: "#e4eeff",
		assistantBubbleBorder: "#c8d8ff",
		assistantBubbleText: "#1f2a44",
		textColor: "#1f2a44",
	},
];

export const PERSONALIZATION_FONT_FAMILIES: PersonalizationFontFamily[] = [
	{
		id: "system",
		label: "Default (Montserrat)",
		value: "inherit",
	},
	{
		id: "chatgpt",
		label: "ChatGPT style",
		value:
			"'Sohne', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
	},
	{
		id: "claude",
		label: "Claude style",
		value: "'Source Serif 4', Georgia, 'Times New Roman', serif",
	},
	{
		id: "gemini",
		label: "Gemini style",
		value: "'Google Sans', 'Manrope', 'Segoe UI', Arial, sans-serif",
	},
];

const PERSONALIZATION_THEME_PRESET_BY_ID = new Map(
	PERSONALIZATION_CHAT_THEME_PRESETS.map((preset) => [preset.id, preset]),
);

const PERSONALIZATION_FONT_FAMILY_BY_ID = new Map(
	PERSONALIZATION_FONT_FAMILIES.map((font) => [font.id, font]),
);

function normalizeHexColor(value: string): string {
	const normalized = value.trim();
	const shortHexMatch = /^#[0-9a-fA-F]{3}$/.exec(normalized);
	if (shortHexMatch) {
		const [r, g, b] = normalized.slice(1).split("");
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	const fullHexMatch = /^#[0-9a-fA-F]{6}$/.exec(normalized);
	if (!fullHexMatch) {
		return PERSONALIZATION_ACCENT_COLORS[0]?.value ?? "#111111";
	}
	return normalized.toLowerCase();
}

function hexToRgb(hex: string) {
	const normalized = normalizeHexColor(hex).replace("#", "");
	const value = Number.parseInt(normalized, 16);
	if (!Number.isFinite(value)) {
		return { r: 17, g: 17, b: 17 };
	}
	return {
		r: (value >> 16) & 255,
		g: (value >> 8) & 255,
		b: value & 255,
	};
}

function getRelativeLuminance(hex: string) {
	const { r, g, b } = hexToRgb(hex);
	const transform = (channel: number) => {
		const normalized = channel / 255;
		return normalized <= 0.03928
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function pickReadableTextColor(backgroundColor: string) {
	return getRelativeLuminance(backgroundColor) > 0.45 ? "#0f172a" : "#f8fafc";
}

export function isPersonalizationThemePresetId(
	value: string | null | undefined,
): value is PersonalizationThemePresetId {
	if (!value) return false;
	return PERSONALIZATION_THEME_PRESET_BY_ID.has(
		value as PersonalizationThemePresetId,
	);
}

export function isPersonalizationFontFamilyId(
	value: string | null | undefined,
): value is PersonalizationFontFamilyId {
	if (!value) return false;
	return PERSONALIZATION_FONT_FAMILY_BY_ID.has(
		value as PersonalizationFontFamilyId,
	);
}

export function resolvePersonalizationThemePreset(
	value: string | null | undefined,
): PersonalizationThemePreset {
	if (isPersonalizationThemePresetId(value)) {
		return (
			PERSONALIZATION_THEME_PRESET_BY_ID.get(value) ??
			PERSONALIZATION_CHAT_THEME_PRESETS[0]
		);
	}
	return PERSONALIZATION_CHAT_THEME_PRESETS[0];
}

export function resolvePersonalizationFontFamily(
	value: string | null | undefined,
): PersonalizationFontFamily {
	if (isPersonalizationFontFamilyId(value)) {
		return (
			PERSONALIZATION_FONT_FAMILY_BY_ID.get(value) ??
			PERSONALIZATION_FONT_FAMILIES[0]
		);
	}
	return PERSONALIZATION_FONT_FAMILIES[0];
}

export function resolveChatroomTheme(
	personalization: PersonalizationSettings,
): ResolvedChatroomTheme {
	const preset = resolvePersonalizationThemePreset(personalization.themePreset);
	const fontId = isPersonalizationFontFamilyId(personalization.fontFamily)
		? personalization.fontFamily
		: preset.defaultFontFamily;
	const font = resolvePersonalizationFontFamily(fontId);
	const accentColor =
		preset.id === "custom"
			? normalizeHexColor(personalization.accentColor)
			: preset.defaultAccentColor;
	return {
		presetId: preset.id,
		presetLabel: preset.label,
		presetDescription: preset.description,
		fontFamilyId: font.id,
		fontFamilyLabel: font.label,
		fontFamilyValue: font.value,
		accentColor,
		appBackground: preset.appBackground,
		sidebarBackground: preset.sidebarBackground,
		sidebarBorder: preset.sidebarBorder,
		headerBackground: preset.headerBackground,
		headerBorder: preset.headerBorder,
		canvasBackground: preset.canvasBackground,
		composerBackground: preset.composerBackground,
		composerBorder: preset.composerBorder,
		assistantBubbleBackground: preset.assistantBubbleBackground,
		assistantBubbleBorder: preset.assistantBubbleBorder,
		assistantBubbleText: preset.assistantBubbleText,
		userBubbleText: pickReadableTextColor(accentColor),
		textColor: preset.textColor,
	};
}

export const generateId = () => {
	if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const APP_HEADERS = {
	"x-app-id": "ai-stats-chat",
	"x-app-name": "AI Stats Chat",
	"x-title": "AI Stats Chat",
	"http-referer": "https://ai-stats.phaseo.app/chat",
};

export const TEMP_CHAT_ID = "temp-chat";

export type PersonalizationSettings = {
	name: string;
	role: string;
	notes: string;
	themePreset: PersonalizationThemePresetId;
	fontFamily: PersonalizationFontFamilyId;
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
		apiServerToolsEnabled: DEFAULT_SETTINGS.apiServerToolsEnabled,
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

