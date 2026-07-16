import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import {
	getRoomScopedStorageKey,
	type ChatRoomId,
} from "@/lib/chat/rooms";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type {
	ChatMessage,
	ChatAdvisorServerToolConfig,
	ChatModelSettings,
	ChatServerToolConfigs,
	ChatServerToolType,
	ChatSettings,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";

export const DEFAULT_SERVER_TOOLS: ChatServerToolType[] = ["gateway:datetime"];
const CHARS_PER_APPROXIMATE_TOKEN = 4;
const MAX_DATETIME_TIMEZONES = 5;
const MAX_ADVISOR_TOOLS = 5;
const TIMEZONE_NAME_PATTERN = /^[A-Za-z0-9_+\-/]+$/;
const SUPPORTED_CHAT_SERVER_TOOLS = new Set<ChatServerToolType>([
	"gateway:datetime",
	"phaseo:web_search",
	"phaseo:web_fetch",
	"phaseo:advisor",
	"phaseo:image_generation",
	"phaseo:fusion",
	"phaseo:subagent",
]);

export type ChatResponseLayout = "sequential" | "side-by-side";
export type NewChatModelPreference = "blank" | "selected";

export function normalizeServerTools(
	serverTools?: ChatServerToolType[],
): ChatServerToolType[] {
	if (serverTools === undefined) return DEFAULT_SERVER_TOOLS;
	return Array.from(new Set(serverTools)).filter((toolType) =>
		SUPPORTED_CHAT_SERVER_TOOLS.has(toolType),
	);
}

export function estimatePromptTokenCount(prompt?: string | null) {
	return Math.ceil((prompt?.length ?? 0) / CHARS_PER_APPROXIMATE_TOKEN);
}

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
	apiServerToolsEnabled: true,
	serverTools: DEFAULT_SERVER_TOOLS,
	serverToolConfigs: {},
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
	"serverTools",
	"serverToolConfigs",
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
	modelDisplayName?: string,
): SettingChange[] => {
	const defaults: ChatSettings = {
		...DEFAULT_SETTINGS,
		systemPrompt: buildDefaultSystemPrompt(modelId, modelDisplayName),
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
		normalizeSystemPromptForComparison(settings.systemPrompt) !==
			normalizeSystemPromptForComparison(defaults.systemPrompt) &&
		!isGeneratedDefaultSystemPrompt(
			settings.systemPrompt,
			modelId,
			modelDisplayName,
		)
	) {
		addChange("System prompt", "Custom");
	}
	return changes;
};

export function getRoomStorageKeys(roomId: ChatRoomId) {
	return {
		apiKey: getRoomScopedStorageKey(roomId, "api-key"),
		baseUrl: getRoomScopedStorageKey(roomId, "base-url"),
		apiTarget: getRoomScopedStorageKey(roomId, "api-target"),
		activeChatId: getRoomScopedStorageKey(roomId, "active-id"),
		lastModelId: getRoomScopedStorageKey(roomId, "last-model-id"),
		personalizationName: getRoomScopedStorageKey(roomId, "personal-name"),
		personalizationRole: getRoomScopedStorageKey(roomId, "personal-role"),
		personalizationNotes: getRoomScopedStorageKey(roomId, "personal-notes"),
		personalizationAccent: getRoomScopedStorageKey(roomId, "personal-accent"),
		notifyOnComplete: getRoomScopedStorageKey(roomId, "notify-on-complete"),
		debugMode: getRoomScopedStorageKey(roomId, "debug"),
		responseLayout: getRoomScopedStorageKey(roomId, "response-layout"),
		newChatModelPreference: getRoomScopedStorageKey(
			roomId,
			"new-chat-model-preference",
		),
	};
}

export const STORAGE_KEYS = getRoomStorageKeys("text");

export type ChatApiTarget = "default" | "public" | "local" | "custom";
export const LOCAL_CHAT_API_BASE_URL = "http://127.0.0.1:8787/v1";

export const PERSONALIZATION_ACCENT_COLORS: Array<{
	label: string;
	value: string;
}> = [
	{ label: "Ink", value: "#111111" },
	{ label: "Cobalt", value: "#2563eb" },
	{ label: "Emerald", value: "#059669" },
	{ label: "Amber", value: "#d97706" },
	{ label: "Rose", value: "#e11d48" },
	{ label: "Violet", value: "#7c3aed" },
];

export const generateId = () => {
	if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const APP_HEADERS = {
	"x-app-id": "phaseo-chat",
	"x-app-name": "Phaseo Chat",
	"x-title": "Phaseo Chat",
	"http-referer": "https://phaseo.app/chat",
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
	return org || "phaseo";
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

const LEGACY_MATH_FORMATTING_RULE =
	"- **For all mathematical expressions, you must use dollar-sign delimiters. Use $...$ for inline math and $$...$$ for block math. Do not use (...) or [...] delimiters.**";

const PREVIOUS_MATH_FORMATTING_RULE =
	"- Do not use \\(...\\) or \\[...\\] delimiters.";

const PREVIOUS_MATH_FORMATTING_RULES = [
	"- Use dollar-sign delimiters for all mathematical expressions: $...$ for inline math and $$...$$ for block math.",
	"- Put the $$ block-math delimiters on their own lines.",
	"- Use valid LaTeX inside delimiters. Escape special characters: write percentages as $80\\%$, never $80%$.",
	PREVIOUS_MATH_FORMATTING_RULE,
] as const;

const HISTORIC_FORMATTING_RULES = [
	"- Use Markdown for lists, tables, and styling.",
	"- Use ```code fences``` for all code blocks.",
	"- Format file names, paths, and function names with `inline code` backticks.",
] as const;

const COMPACT_FORMATTING_RULE =
	"Markdown; ```code fences```; `backticks` for code, filenames, paths, and functions. Use $...$ or $$...$$ only for typeset math; put $$ delimiters on their own lines. Keep numbers, percentages, and currency plain. Use valid LaTeX: escape % in math (e.g. $80\\%$); no \\(...\\) or \\[...\\].";

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
		`Formatting: ${COMPACT_FORMATTING_RULE}`,
	].join("\n");
}

const normalizeSystemPromptForComparison = (prompt?: string | null) =>
	(prompt ?? "").replace(/\r\n/g, "\n").trim();

export function isGeneratedDefaultSystemPrompt(
	prompt: string | undefined,
	modelId: string,
	modelDisplayName?: string,
) {
	const normalizedPrompt = normalizeSystemPromptForComparison(prompt);
	if (!normalizedPrompt) return false;
	const exactDefaults = new Set([
		normalizeSystemPromptForComparison(buildDefaultSystemPrompt(modelId)),
		normalizeSystemPromptForComparison(
			buildDefaultSystemPrompt(modelId, modelDisplayName),
		),
	]);
	if (exactDefaults.has(normalizedPrompt)) return true;

	const safeModelId = modelId || "AI model";
	const orgLabel = formatOrgLabel(getOrgId(safeModelId));
	const separatorIndex = normalizedPrompt.indexOf("\n\n");
	if (separatorIndex < 0) return false;

	const identityLine = normalizedPrompt.slice(0, separatorIndex);
	const formattingSection = normalizedPrompt.slice(separatorIndex + 2);
	const identitySuffix = `, a large language model from ${orgLabel}.`;
	const hasGeneratedIdentity =
		identityLine === `You are ${safeModelId}${identitySuffix}` ||
		(identityLine.startsWith(`You are ${safeModelId}, known as: `) &&
			identityLine.endsWith(identitySuffix));
	if (!hasGeneratedIdentity) return false;

	const historicFormattingSections = new Set([
		`Formatting: ${COMPACT_FORMATTING_RULE}`,
		["Formatting Rules:", ...HISTORIC_FORMATTING_RULES, LEGACY_MATH_FORMATTING_RULE].join("\n"),
		[
			"Formatting Rules:",
			...HISTORIC_FORMATTING_RULES,
			...PREVIOUS_MATH_FORMATTING_RULES,
		].join("\n"),
		["Formatting Rules:", LEGACY_MATH_FORMATTING_RULE].join("\n"),
		["Formatting Rules:", PREVIOUS_MATH_FORMATTING_RULE].join("\n"),
	]);
	return historicFormattingSections.has(formattingSection);
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
		serverTools: DEFAULT_SETTINGS.serverTools,
		serverToolConfigs: DEFAULT_SETTINGS.serverToolConfigs,
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

export function buildServerToolDefinitions(
	serverTools?: ChatServerToolType[],
	serverToolConfigs?: ChatServerToolConfigs,
	options?: {
		datetimeTimezone?: string | null;
		datetimeTimezones?: string[];
	},
): Array<Record<string, unknown>> {
	const parseDomainList = (value?: string) =>
		(value ?? "")
			.split(",")
			.map((domain) => domain.trim())
			.filter(Boolean);
	const isSafeTimezoneName = (value: string) =>
		value.length <= 64 &&
		TIMEZONE_NAME_PATTERN.test(value) &&
		!value.includes("..") &&
		!value.startsWith("/") &&
		!value.endsWith("/");
	const setOptionalNumber = (
		parameters: Record<string, unknown>,
		key: string,
		value: number | null | undefined,
		options?: { min?: number; max?: number },
	) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return;
		const min = options?.min ?? Number.NEGATIVE_INFINITY;
		const max = options?.max ?? Number.POSITIVE_INFINITY;
		parameters[key] = Math.max(min, Math.min(max, Math.round(value)));
	};
	const withParameters = (
		type: string,
		parameters: Record<string, unknown>,
	) =>
		Object.keys(parameters).length > 0
			? { type, parameters }
			: { type };
	const buildAdvisorDefinition = (
		advisor?: ChatAdvisorServerToolConfig,
		fallbackName?: string,
	) => {
		const parameters: Record<string, unknown> = {};
		const advisorName = advisor?.name?.trim() || fallbackName;
		if (advisorName) {
			parameters.name = advisorName;
		}
		if (advisor?.model?.trim()) {
			parameters.model = advisor.model.trim();
		}
		if (advisor?.instructions?.trim()) {
			parameters.instructions = advisor.instructions.trim();
		}
		if (advisor?.forwardTranscript !== undefined) {
			parameters.forward_transcript = advisor.forwardTranscript;
		}
		if (typeof advisor?.maxUses === "number" && Number.isFinite(advisor.maxUses)) {
			parameters.max_uses = Math.max(1, Math.round(advisor.maxUses));
		}
		if (
			typeof advisor?.maxCompletionTokens === "number" &&
			Number.isFinite(advisor.maxCompletionTokens)
		) {
			parameters.max_completion_tokens = Math.max(
				1,
				Math.round(advisor.maxCompletionTokens),
			);
		}
		if (
			typeof advisor?.temperature === "number" &&
			Number.isFinite(advisor.temperature)
		) {
			parameters.temperature = advisor.temperature;
		}
		if (advisor?.reasoningEffort && advisor.reasoningEffort !== "none") {
			parameters.reasoning = { effort: advisor.reasoningEffort };
		}
		return withParameters("phaseo:advisor", parameters);
	};

	return normalizeServerTools(serverTools).flatMap((toolType) => {
		if (toolType === "gateway:datetime") {
			const timezones = [
				...(options?.datetimeTimezones ?? []),
				options?.datetimeTimezone ?? null,
				serverToolConfigs?.datetime?.timezone ?? null,
			].reduce<string[]>((acc, value) => {
				if (acc.length >= MAX_DATETIME_TIMEZONES) return acc;
				const timezone = value?.trim();
				if (
					timezone &&
					isSafeTimezoneName(timezone) &&
					!acc.includes(timezone)
				) {
					acc.push(timezone);
				}
				return acc;
			}, []);
			return timezones.length
				? { type: toolType, parameters: { timezones } }
				: { type: toolType };
		}
		if (toolType === "phaseo:web_search") {
			const config = serverToolConfigs?.webSearch;
			const parameters: Record<string, unknown> = {};
			if (config?.engine && config.engine !== "auto") {
				parameters.engine = config.engine;
			}
			if (config?.searchContextSize) {
				parameters.search_context_size = config.searchContextSize;
			}
			setOptionalNumber(parameters, "max_results", config?.maxResults, {
				min: 1,
				max: 25,
			});
			setOptionalNumber(
				parameters,
				"max_total_results",
				config?.maxTotalResults,
				{ min: 1, max: 100 },
			);
			setOptionalNumber(
				parameters,
				"max_characters",
				config?.maxCharacters,
				{ min: 1, max: 50000 },
			);
			const allowedDomains = parseDomainList(config?.allowedDomains);
			if (allowedDomains.length > 0) {
				parameters.allowed_domains = allowedDomains;
			}
			const excludedDomains = parseDomainList(config?.excludedDomains);
			if (excludedDomains.length > 0) {
				parameters.excluded_domains = excludedDomains;
			}
			if (config?.includeHighlights !== undefined) {
				parameters.include_highlights = config.includeHighlights;
			}
			if (config?.includeText !== undefined) {
				parameters.include_text = config.includeText;
			}
			return withParameters(toolType, parameters);
		}
		if (toolType === "phaseo:web_fetch") {
			const config = serverToolConfigs?.webFetch;
			const parameters: Record<string, unknown> = {};
			if (config?.engine && config.engine !== "auto") {
				parameters.engine = config.engine;
			}
			setOptionalNumber(parameters, "max_chars", config?.maxChars, {
				min: 1,
				max: 50000,
			});
			const allowedDomains = parseDomainList(config?.allowedDomains);
			if (allowedDomains.length > 0) {
				parameters.allowed_domains = allowedDomains;
			}
			const blockedDomains = parseDomainList(config?.blockedDomains);
			if (blockedDomains.length > 0) {
				parameters.blocked_domains = blockedDomains;
			}
			return withParameters(toolType, parameters);
		}
		if (toolType === "phaseo:image_generation") {
			const config = serverToolConfigs?.imageGeneration;
			const parameters: Record<string, unknown> = {};
			if (config?.model?.trim()) {
				parameters.model = config.model.trim();
			}
			if (config?.quality && config.quality !== "auto") {
				parameters.quality = config.quality;
			}
			if (config?.size && config.size !== "auto") {
				parameters.size = config.size;
			}
			if (config?.aspectRatio && config.aspectRatio !== "auto") {
				parameters.aspect_ratio = config.aspectRatio;
			}
			if (config?.background && config.background !== "auto") {
				parameters.background = config.background;
			}
			if (config?.outputFormat && config.outputFormat !== "auto") {
				parameters.output_format = config.outputFormat;
			}
			setOptionalNumber(
				parameters,
				"output_compression",
				config?.outputCompression,
				{ min: 0, max: 100 },
			);
			if (config?.moderation && config.moderation !== "auto") {
				parameters.moderation = config.moderation;
			}
			return withParameters(toolType, parameters);
		}
		if (toolType === "phaseo:fusion") {
			const fusion = serverToolConfigs?.fusion;
			const fusionModels = Array.from(
				new Set(
					(fusion?.models ?? [])
						.map((model) => model.trim())
						.filter(Boolean),
				),
			).slice(0, MAX_ADVISOR_TOOLS);
			const definitions = fusionModels.map((model, index) =>
				buildAdvisorDefinition(
					{
						name: `fusion_${index + 1}`,
						model,
						instructions:
							"Analyze the user's request independently. Return concise findings, assumptions, caveats, and the answer direction you recommend for synthesis.",
						maxUses: fusion?.maxUses ?? 8,
					},
					`fusion_${index + 1}`,
				),
			);
			if (fusion?.judgeModel?.trim()) {
				definitions.push(
					buildAdvisorDefinition(
						{
							name: "fusion_judge",
							model: fusion.judgeModel.trim(),
							instructions:
								"Review the analysis model outputs and identify the strongest final answer direction.",
							maxUses: fusion?.maxUses ?? 8,
						},
						"fusion_judge",
					),
				);
			}
			return definitions;
		}
		if (toolType === "phaseo:subagent") {
			const config = serverToolConfigs?.subagent;
			const parameters: Record<string, unknown> = {};
			if (config?.model?.trim()) {
				parameters.model = config.model.trim();
			}
			if (config?.instructions?.trim()) {
				parameters.instructions = config.instructions.trim();
			}
			if (typeof config?.maxUses === "number" && Number.isFinite(config.maxUses)) {
				parameters.max_uses = Math.max(1, Math.round(config.maxUses));
			}
			if (
				typeof config?.maxCompletionTokens === "number" &&
				Number.isFinite(config.maxCompletionTokens)
			) {
				parameters.max_completion_tokens = Math.max(
					1024,
					Math.round(config.maxCompletionTokens),
				);
			}
			if (
				typeof config?.temperature === "number" &&
				Number.isFinite(config.temperature)
			) {
				parameters.temperature = Math.max(0, Math.min(2, config.temperature));
			}
			if (config?.reasoningEffort && config.reasoningEffort !== "none") {
				parameters.reasoning = { effort: config.reasoningEffort };
			}
			return withParameters(toolType, parameters);
		}
		if (toolType !== "phaseo:advisor") {
			return [{ type: toolType }];
		}
		const advisors =
			serverToolConfigs?.advisors && serverToolConfigs.advisors.length > 0
				? serverToolConfigs.advisors
				: [serverToolConfigs?.advisor];
		return advisors
			.slice(0, MAX_ADVISOR_TOOLS)
			.map((advisor, index) =>
				buildAdvisorDefinition(advisor, `advisor_${index + 1}`),
			);
	});
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
