"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
} from "@/components/ui/sidebar";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import { createClient } from "@/utils/supabase/client";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type {
	ChatMessage,
	ChatSettings,
	ChatThread,
} from "@/lib/indexeddb/chats";
import { deleteChat, getAllChats, upsertChat } from "@/lib/indexeddb/chats";
import { FEATURED_MODEL_IDS } from "@/components/(chat)/playgroundConfig";
import { ChatConversation } from "@/components/(chat)/ChatConversation";
import { ChatHeader } from "@/components/(chat)/ChatHeader";
import { ModelSettingsDialog } from "@/components/(chat)/ModelSettingsDialog";
import { ChatSearchDialog } from "@/components/(chat)/ChatSearchDialog";
import { ChatRenameDialog } from "@/components/(chat)/ChatRenameDialog";
import { ChatDeleteDialog } from "@/components/(chat)/ChatDeleteDialog";
import { ChatNewChatDialog } from "@/components/(chat)/ChatNewChatDialog";
import {
	coerceResponseText,
	extractReasoningText,
	extractResponseText,
} from "@/components/(chat)/chatPayload";
import {
	ChatSidebar,
	type GroupedThreads,
} from "@/components/(chat)/ChatSidebar";

const DEFAULT_SETTINGS: ChatSettings = {
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
};

type SettingChange = {
	label: string;
	value: string;
};

const formatSettingValue = (value: unknown, fallback = "Default") => {
	if (value == null || value === "") return fallback;
	if (typeof value === "boolean") return value ? "On" : "Off";
	if (typeof value === "number") return String(value);
	return String(value);
};

const getChangedSettings = (
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

const STORAGE_KEYS = {
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

const generateId = () => {
	if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const APP_HEADERS = {
	"x-title": "AI Stats Chat",
	"http-referer": "https://ai-stats.phaseo.app/chat",
};

const TEMP_CHAT_ID = "temp-chat";

type PersonalizationSettings = {
	name: string;
	role: string;
	notes: string;
	accentColor: string;
};

function nowIso() {
	return new Date().toISOString();
}

function buildTitle(messages: ChatMessage[]) {
	const first = messages.find((msg) => msg.role === "user");
	if (!first) return "New chat";
	return first.content.trim().slice(0, 48) || "New chat";
}

function buildPersonalizationPrompt(personalization: PersonalizationSettings) {
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

function extractTotalCostUsd(usage: Record<string, unknown> | null) {
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

function normalizeBaseUrl(baseUrl: string) {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	return trimmed || BASE_URL;
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function buildDefaultSystemPrompt(modelId: string) {
	const safeModelId = modelId || "AI model";
	const modelLabel = formatModelLabel(safeModelId);
	const orgLabel = formatOrgLabel(getOrgId(safeModelId));
	return [
		`You are ${modelLabel}, a large language model from ${orgLabel}.`,
		"",
		"Formatting Rules:",
		"- Use Markdown for lists, tables, and styling.",
		"- Use ```code fences``` for all code blocks.",
		"- Format file names, paths, and function names with `inline code` backticks.",
		"- **For all mathematical expressions, you must use dollar-sign delimiters. Use $...$ for inline math and $$...$$ for block math. Do not use (...) or [...] delimiters.**",
	].join("\n");
}

function ensureVariants(message: ChatMessage) {
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

type ChatPlaygroundProps = {
	models: GatewaySupportedModel[];
	modelParam?: string | null;
	promptParam?: string | null;
};

type ModelOption = {
	modelId: string;
	orgId: string;
	orgName: string;
	label: string;
	providerIds: string[];
	providerNames: string[];
	providerAvailability: Record<string, boolean>;
	releaseDate: string | null;
	gatewayStatus: "active" | "inactive";
};

type ChatUser = {
	id: string;
	email: string | null;
	name: string;
	avatarUrl: string | null;
};

function ChatPlaygroundContent({
	models,
	modelParam,
	promptParam,
}: ChatPlaygroundProps) {
	const [threads, setThreads] = useState<ChatThread[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [, setError] = useState<string | null>(null);
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState(BASE_URL);
	const [authUser, setAuthUser] = useState<ChatUser | null>(null);
	const [userRole, setUserRole] = useState<string | null>(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [debugEnabled, setDebugEnabled] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<ChatThread | null>(null);
	const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
	const [pendingNewChat, setPendingNewChat] = useState<{
		modelId: string;
		settings: ChatSettings;
		changes: SettingChange[];
	} | null>(null);
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [temporaryThread, setTemporaryThread] = useState<ChatThread | null>(
		null,
	);
	const [previousStoredId, setPreviousStoredId] = useState<string | null>(
		null,
	);

	const defaultModelId = models[0]?.modelId ?? "";
	const [lastModelId, setLastModelId] = useState(defaultModelId);
	const queryModelId = (modelParam ?? "").trim();
	const queryPrompt = promptParam ?? "";
	const queryModelIsValid = useMemo(() => {
		if (!queryModelId) return false;
		return models.some((model) => model.modelId === queryModelId);
	}, [models, queryModelId]);
	const [personalization, setPersonalization] =
		useState<PersonalizationSettings>({
			name: "",
			role: "",
			notes: "",
			accentColor: "#111111",
		});

	const modelOptions = useMemo(() => {
		const map = new Map<string, ModelOption>();

		for (const model of models) {
			const existing = map.get(model.modelId);
			const orgId = getOrgId(model.modelId);
			const orgName =
				model.organisationName ??
				model.providerName ??
				formatOrgLabel(orgId);
			const label = model.modelName ?? formatModelLabel(model.modelId);
			const releaseDate =
				model.releaseDate ?? model.announcementDate ?? null;

			if (!existing) {
				map.set(model.modelId, {
					modelId: model.modelId,
					orgId,
					orgName,
					label,
					providerIds: [model.providerId],
					providerNames: [
						model.providerName ?? formatOrgLabel(model.providerId),
					],
					providerAvailability: {
						[model.providerId]: model.isAvailable,
					},
					releaseDate,
					gatewayStatus: model.isAvailable
						? ("active" as const)
						: ("inactive" as const),
				});
			} else {
				if (!existing.providerIds.includes(model.providerId)) {
					existing.providerIds.push(model.providerId);
				}
				const providerLabel =
					model.providerName ?? formatOrgLabel(model.providerId);
				if (!existing.providerNames.includes(providerLabel)) {
					existing.providerNames.push(providerLabel);
				}
				existing.providerAvailability[model.providerId] =
					existing.providerAvailability[model.providerId] ||
					model.isAvailable;
				if (!existing.releaseDate && releaseDate) {
					existing.releaseDate = releaseDate;
				}
				if (
					existing.label === formatModelLabel(existing.modelId) &&
					model.modelName
				) {
					existing.label = model.modelName;
				}
				if (
					existing.orgName === formatOrgLabel(existing.orgId) &&
					model.organisationName
				) {
					existing.orgName = model.organisationName;
				}
			}
		}

		const options = Array.from(map.values()).map((option) => ({
			...option,
			gatewayStatus: Object.values(option.providerAvailability).some(
				Boolean,
			)
				? ("active" as const)
				: ("inactive" as const),
		}));
		options.sort((a, b) => a.label.localeCompare(b.label));
		const featured: ModelOption[] = [];
		const grouped = new Map<string, ModelOption[]>();
		const comingSoon: ModelOption[] = [];
		for (const option of options) {
			const isFeatured = FEATURED_MODEL_IDS.includes(option.modelId);
			if (isFeatured && option.gatewayStatus === "active") {
				featured.push(option);
				continue;
			}
			if (option.gatewayStatus === "inactive") {
				comingSoon.push(option);
			} else {
				const list = grouped.get(option.orgId) ?? [];
				list.push(option);
				grouped.set(option.orgId, list);
			}
		}

		for (const list of grouped.values()) {
			list.sort((a, b) => a.label.localeCompare(b.label));
		}

		comingSoon.sort((a, b) => {
			const orgCompare = a.orgId.localeCompare(b.orgId);
			if (orgCompare !== 0) return orgCompare;
			return a.label.localeCompare(b.label);
		});

		return { featured, grouped, comingSoon };
	}, [models]);

	const providerOptions = useMemo(() => {
		const map = new Map<string, string>();
		for (const model of models) {
			if (!map.has(model.providerId)) {
				map.set(
					model.providerId,
					model.providerName ?? formatOrgLabel(model.providerId),
				);
			}
		}
		return Array.from(map.entries())
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [models]);

	const isAuthenticated = Boolean(authUser);
	const isAdmin = userRole === "admin";
	const hasApiKey = apiKey.trim().length > 0;
	const shouldDebug = debugEnabled && isAdmin;

	const handleDebugChange = useCallback((value: boolean) => {
		setDebugEnabled(value);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(
				STORAGE_KEYS.debugMode,
				value ? "true" : "false",
			);
		}
	}, []);

	const handleExportChats = useCallback(async () => {
		const chats = await getAllChats();
		const payload = {
			exportedAt: new Date().toISOString(),
			chats,
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `ai-stats-chats-${Date.now()}.json`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}, []);

	const handleSignOut = useCallback(async () => {
		const supabase = createClient();
		await supabase.auth.signOut();
		setAuthUser(null);
		setUserRole(null);
		window.location.href = "/sign-in";
	}, []);

	const orgNameById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const model of models) {
			const orgId = getOrgId(model.modelId);
			if (!map[orgId]) {
				map[orgId] =
					model.organisationName ??
					model.providerName ??
					formatOrgLabel(orgId);
			}
		}
		return map;
	}, [models]);

	const activeThread = useMemo(() => {
		if (temporaryMode && temporaryThread) return temporaryThread;
		return threads.find((thread) => thread.id === activeId) ?? null;
	}, [temporaryMode, temporaryThread, threads, activeId]);

	const sortedThreads = useMemo(() => {
		return [...threads].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}, [threads]);

	const groupedThreads = useMemo(() => {
		const groups: GroupedThreads = {
			pinned: [],
			today: [],
			yesterday: [],
			week: [],
			month: [],
			older: [],
		};

		const now = new Date();
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);
		const startOfYesterday = new Date(startOfToday);
		startOfYesterday.setDate(startOfToday.getDate() - 1);
		const startOfWeek = new Date(startOfToday);
		const weekday = (startOfToday.getDay() + 6) % 7;
		startOfWeek.setDate(startOfToday.getDate() - weekday);
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

		for (const thread of sortedThreads) {
			if (thread.pinned) {
				groups.pinned.push(thread);
				continue;
			}
			const updated = new Date(thread.updatedAt);
			if (updated >= startOfToday) {
				groups.today.push(thread);
			} else if (updated >= startOfYesterday) {
				groups.yesterday.push(thread);
			} else if (updated >= startOfWeek) {
				groups.week.push(thread);
			} else if (updated >= startOfMonth) {
				groups.month.push(thread);
			} else {
				groups.older.push(thread);
			}
		}

		return groups;
	}, [sortedThreads]);

	const persistThread = useCallback(async (thread: ChatThread) => {
		await upsertChat(thread);
	}, []);

	const setActiveThread = useCallback(
		(thread: ChatThread | null) => {
			if (!thread) return;
			setTemporaryMode(false);
			setTemporaryThread(null);
			setActiveId(thread.id);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					STORAGE_KEYS.activeChatId,
					thread.id,
				);
			}
		},
		[setActiveId],
	);

	const ensureInitialThread = useCallback(
		async (existing: ChatThread[], preferredModelId: string) => {
			if (existing.length > 0) return existing;
			const id = generateId();
			const createdAt = nowIso();
			const newThread: ChatThread = {
				id,
				title: "New chat",
				titleLocked: false,
				modelId: preferredModelId,
				createdAt,
				updatedAt: createdAt,
				messages: [],
				settings: {
					...DEFAULT_SETTINGS,
					systemPrompt: buildDefaultSystemPrompt(preferredModelId),
				},
			};
			await upsertChat(newThread);
			return [newThread];
		},
		[],
	);

	useEffect(() => {
		let mounted = true;
		(async () => {
			const storedKey =
				window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
			const storedBase =
				window.localStorage.getItem(STORAGE_KEYS.baseUrl) ?? BASE_URL;
			const storedActive = window.localStorage.getItem(
				STORAGE_KEYS.activeChatId,
			);
			const storedModel = window.localStorage.getItem(
				STORAGE_KEYS.lastModelId,
			);
			const storedPersonalName =
				window.localStorage.getItem(STORAGE_KEYS.personalizationName) ??
				"";
			const storedPersonalRole =
				window.localStorage.getItem(STORAGE_KEYS.personalizationRole) ??
				"";
			const storedPersonalNotes =
				window.localStorage.getItem(
					STORAGE_KEYS.personalizationNotes,
				) ?? "";
			const storedAccent =
				window.localStorage.getItem(
					STORAGE_KEYS.personalizationAccent,
				) ?? "#111111";
			const resolvedModel =
				(queryModelIsValid && queryModelId) ||
				(storedModel &&
					models.some((model) => model.modelId === storedModel) &&
					storedModel) ||
				defaultModelId;
			if (!mounted) return;
			setApiKey(storedKey);
			setBaseUrl(storedBase);
			setLastModelId(resolvedModel);
			setPersonalization({
				name: storedPersonalName,
				role: storedPersonalRole,
				notes: storedPersonalNotes,
				accentColor: storedAccent,
			});

			const chats = await getAllChats();
			const normalized = await ensureInitialThread(chats, resolvedModel);
			if (!mounted) return;
			setThreads(normalized);

			const initialId =
				storedActive && normalized.some((t) => t.id === storedActive)
					? storedActive
					: (normalized[0]?.id ?? null);
			setActiveId(initialId);
		})();
		return () => {
			mounted = false;
		};
	}, [
		defaultModelId,
		ensureInitialThread,
		models,
		queryModelId,
		queryModelIsValid,
	]);

	useEffect(() => {
		if (!activeThread?.modelId) return;
		setLastModelId(activeThread.modelId);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(
				STORAGE_KEYS.lastModelId,
				activeThread.modelId,
			);
		}
	}, [activeThread?.modelId]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			STORAGE_KEYS.personalizationName,
			personalization.name,
		);
		window.localStorage.setItem(
			STORAGE_KEYS.personalizationRole,
			personalization.role,
		);
		window.localStorage.setItem(
			STORAGE_KEYS.personalizationNotes,
			personalization.notes,
		);
		window.localStorage.setItem(
			STORAGE_KEYS.personalizationAccent,
			personalization.accentColor,
		);
	}, [personalization]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const storedDebug = window.localStorage.getItem(STORAGE_KEYS.debugMode);
		if (storedDebug === "true") {
			setDebugEnabled(true);
		}
	}, []);

	useEffect(() => {
		let mounted = true;
		const supabase = createClient();
		const loadUser = async () => {
			setAuthLoading(true);
			const { data, error } = await supabase.auth.getUser();
			if (!mounted) return;
			if (error || !data.user) {
				setAuthUser(null);
				setUserRole(null);
				setAuthLoading(false);
				return;
			}
			const profile = await supabase
				.from("users")
				.select("display_name, role")
				.eq("user_id", data.user.id)
				.maybeSingle();
			if (!mounted) return;
			const displayName =
				profile.data?.display_name ??
				data.user.user_metadata?.full_name ??
				data.user.user_metadata?.name ??
				data.user.email ??
				"Account";
			setAuthUser({
				id: data.user.id,
				email: data.user.email ?? null,
				name: displayName,
				avatarUrl: data.user.user_metadata?.avatar_url ?? null,
			});
			setUserRole(profile.data?.role ?? null);
			setAuthLoading(false);
		};
		loadUser();
		const { data: listener } = supabase.auth.onAuthStateChange(() => {
			loadUser();
		});
		return () => {
			mounted = false;
			listener.subscription.unsubscribe();
		};
	}, []);

	const createThreadWithSettings = useCallback(
		async (modelId: string, settings: ChatSettings) => {
			setError(null);
			const id = generateId();
			const createdAt = nowIso();
			const systemPrompt =
				settings.systemPrompt ?? buildDefaultSystemPrompt(modelId);
			const newThread: ChatThread = {
				id,
				title: "New chat",
				titleLocked: false,
				modelId,
				createdAt,
				updatedAt: createdAt,
				messages: [],
				settings: {
					...settings,
					systemPrompt,
				},
			};
			await upsertChat(newThread);
			setThreads((prev) => [newThread, ...prev]);
			setActiveThread(newThread);
		},
		[setActiveThread],
	);

	const createThread = useCallback(async () => {
		const selectedModel =
			activeThread?.modelId || lastModelId || defaultModelId;
		if (!selectedModel) return;
		if (activeThread) {
			const changes = getChangedSettings(
				activeThread.settings,
				selectedModel,
			);
			if (changes.length > 0) {
				setPendingNewChat({
					modelId: selectedModel,
					settings: activeThread.settings,
					changes,
				});
				setNewChatDialogOpen(true);
				return;
			}
		}
		const defaults: ChatSettings = {
			...DEFAULT_SETTINGS,
			systemPrompt: buildDefaultSystemPrompt(selectedModel),
		};
		await createThreadWithSettings(selectedModel, defaults);
	}, [activeThread, defaultModelId, lastModelId, createThreadWithSettings]);

	const handleNewChatDecision = useCallback(
		(useCurrent: boolean) => {
			if (!pendingNewChat) {
				setNewChatDialogOpen(false);
				return;
			}
			const modelId = pendingNewChat.modelId;
			const settings = useCurrent
				? pendingNewChat.settings
				: {
						...DEFAULT_SETTINGS,
						systemPrompt: buildDefaultSystemPrompt(modelId),
					};
			setNewChatDialogOpen(false);
			setPendingNewChat(null);
			void createThreadWithSettings(modelId, settings);
		},
		[pendingNewChat, createThreadWithSettings],
	);

	const updateStoredThread = useCallback(
		async (nextThread: ChatThread, persist = true) => {
			setThreads((prev) =>
				prev.map((thread) =>
					thread.id === nextThread.id ? nextThread : thread,
				),
			);
			if (persist) {
				await persistThread(nextThread);
			}
		},
		[persistThread],
	);

	const updateThreadState = useCallback(
		async (nextThread: ChatThread, persist = true) => {
			if (temporaryMode && nextThread.id === TEMP_CHAT_ID) {
				setTemporaryThread(nextThread);
				return;
			}
			await updateStoredThread(nextThread, persist);
		},
		[temporaryMode, updateStoredThread],
	);

	const applyMessageUpdate = useCallback(
		(
			thread: ChatThread,
			messageId: string,
			updater: (message: ChatMessage) => ChatMessage,
		) => {
			const messages = thread.messages.map((message) =>
				message.id === messageId ? updater(message) : message,
			);
			return { ...thread, messages, updatedAt: nowIso() };
		},
		[],
	);

	const appendAssistantVariant = useCallback(
		(
			thread: ChatThread,
			messageId: string,
			variant: {
				id: string;
				content: string;
				createdAt: string;
				usage?: Record<string, unknown> | null;
				meta?: Record<string, unknown> | null;
			},
		) => {
			let variantIndex = 0;
			const nextThread = applyMessageUpdate(
				thread,
				messageId,
				(message) => {
					const variants = [...ensureVariants(message), variant];
					variantIndex = variants.length - 1;
					const orgId = getOrgId(message.modelId ?? thread.modelId);
					return {
						...message,
						modelId: message.modelId ?? thread.modelId,
						providerId:
							message.providerId ?? thread.settings.providerId,
						providerName:
							message.providerName ??
							orgNameById[orgId] ??
							formatOrgLabel(orgId),
						content: variant.content,
						variants,
						activeVariantIndex: variantIndex,
						usage: variant.usage ?? null,
						meta: variant.meta ?? null,
					};
				},
			);
			return { nextThread, variantIndex };
		},
		[applyMessageUpdate, orgNameById],
	);

	const updateAssistantVariant = useCallback(
		(
			thread: ChatThread,
			messageId: string,
			variantIndex: number,
			content: string,
			usage?: Record<string, unknown> | null,
			meta?: Record<string, unknown> | null,
		) => {
			return applyMessageUpdate(thread, messageId, (message) => {
				const variants = ensureVariants(message).map(
					(variant, index) =>
						index === variantIndex
							? {
									...variant,
									content,
									usage: usage ?? variant.usage ?? null,
									meta: meta ?? variant.meta ?? null,
								}
							: variant,
				);
				const activeIndex = variantIndex;
				const activeVariant = variants[activeIndex];
				const orgId = getOrgId(message.modelId ?? thread.modelId);
				return {
					...message,
					modelId: message.modelId ?? thread.modelId,
					providerId:
						message.providerId ?? thread.settings.providerId,
					providerName:
						message.providerName ??
						orgNameById[orgId] ??
						formatOrgLabel(orgId),
					content: activeVariant?.content ?? message.content,
					variants,
					activeVariantIndex: activeIndex,
					usage: activeVariant?.usage ?? message.usage ?? null,
					meta: activeVariant?.meta ?? message.meta ?? null,
				};
			});
		},
		[applyMessageUpdate, orgNameById],
	);

	const handleSaveSettings = useCallback(() => {
		window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey.trim());
		window.localStorage.setItem(
			STORAGE_KEYS.baseUrl,
			baseUrl.trim() || BASE_URL,
		);
		setSettingsOpen(false);
	}, [apiKey, baseUrl]);

	const executeCompletion = useCallback(
		async (
			thread: ChatThread,
			contextMessages: ChatMessage[],
			targetAssistantId?: string,
		) => {
			const payloadMessages = [] as Array<{
				role: string;
				content: string;
			}>;
			const personalizationPrompt =
				buildPersonalizationPrompt(personalization);
			const systemPrompt = thread.settings.systemPrompt?.trim() ?? "";
			const mergedSystemPrompt = [systemPrompt, personalizationPrompt]
				.filter(Boolean)
				.join("\n\n");
			if (mergedSystemPrompt) {
				payloadMessages.push({
					role: "system",
					content: mergedSystemPrompt,
				});
			}
			payloadMessages.push(
				...contextMessages.map((msg) => ({
					role: msg.role,
					content: msg.content,
				})),
			);

			const base = normalizeBaseUrl(baseUrl);
			const input = payloadMessages
				.filter((message) => message.role !== "system")
				.map((message) => ({
					role: message.role,
					content: message.content,
				}));
			const requestBody: Record<string, unknown> = {
				model: thread.modelId,
				input,
				...(mergedSystemPrompt
					? { instructions: mergedSystemPrompt }
					: {}),
				stream: thread.settings.stream,
				usage: true,
				meta: true,
			};

			if (
				thread.settings.providerId &&
				thread.settings.providerId !== "auto"
			) {
				requestBody.provider = {
					only: [thread.settings.providerId],
				};
			}
			if (thread.settings.reasoningEnabled) {
				requestBody.reasoning = {
					effort: thread.settings.reasoningEffort ?? "medium",
					summary: "auto",
				};
			}

			setError(null);
			setIsSending(true);

			const requestStartedAt = performance.now();
			let firstTokenAt: number | null = null;
			let finalUsage: Record<string, unknown> | null = null;
			let finalMeta: Record<string, unknown> | null = null;
			let latestThread = thread;
			const assistantId = targetAssistantId ?? generateId();
			let variantIndex = 0;
			let assistantContent = "";
			let placeholderReady = false;

			if (!thread.settings.stream) {
				if (targetAssistantId) {
					const initialVariant = {
						id: generateId(),
						content: "Generating...",
						createdAt: nowIso(),
					};
					const result = appendAssistantVariant(
						latestThread,
						targetAssistantId,
						initialVariant,
					);
					latestThread = result.nextThread;
					variantIndex = result.variantIndex;
					assistantContent = initialVariant.content;
					placeholderReady = true;
					await updateThreadState(latestThread, false);
				} else {
					const orgId = getOrgId(thread.modelId);
					const createdAt = nowIso();
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "Generating...",
						createdAt,
						modelId: thread.modelId,
						providerId: thread.settings.providerId,
						providerName:
							orgNameById[orgId] ?? formatOrgLabel(orgId),
						variants: [
							{
								id: assistantId,
								content: "Generating...",
								createdAt,
							},
						],
						activeVariantIndex: 0,
					};
					latestThread = {
						...thread,
						messages: [...thread.messages, assistantMessage],
						updatedAt: nowIso(),
					};
					placeholderReady = true;
					await updateThreadState(latestThread, false);
				}
			}

			const buildClientMeta = (endAt: number) => {
				const firstToken = firstTokenAt ?? endAt;
				const latencyMs = Math.max(0, firstToken - requestStartedAt);
				const generationMs = Math.max(0, endAt - firstToken);
				const totalTokens =
					(finalUsage?.total_tokens as number | undefined) ??
					(finalUsage?.totalTokens as number | undefined) ??
					null;
				const throughputTokensPerSecond =
					totalTokens && generationMs > 0
						? totalTokens / (generationMs / 1000)
						: null;
				return {
					latencyMs,
					generationMs,
					throughputTokensPerSecond,
				};
			};

			const mergeMeta = (
				clientMeta: Record<string, unknown>,
			): Record<string, unknown> => ({
				...(finalMeta ?? {}),
				client: clientMeta,
			});

			try {
				const response = await fetch("/api/chat/playground", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						baseUrl: base,
						apiKey: apiKey.trim(),
						requestBody,
						appHeaders: APP_HEADERS,
						debug: shouldDebug,
					}),
				});
				// eslint-disable-next-line no-console
				console.log(
					"[chat] response",
					response.status,
					response.statusText,
				);

				if (!response.ok) {
					const text = await response.text();
					throw new Error(text || "Request failed.");
				}

				if (!thread.settings.stream || !response.body) {
					const data = await response.json();
					const reply = extractResponseText(data);
					finalUsage =
						data?.usage ??
						data?.response?.usage ??
						data?.response?.output?.usage ??
						null;
					finalMeta = data?.meta ?? data?.response?.meta ?? null;
					const clientMeta = buildClientMeta(performance.now());
					const mergedMeta = mergeMeta(clientMeta);
					const reasoningText = extractReasoningText(data);
					if (reasoningText) {
						mergedMeta.reasoning_text = reasoningText;
					}
					if (shouldDebug) {
						// eslint-disable-next-line no-console
						console.log("[chat] non-stream usage", finalUsage);
					}
					const totalCostUsd = extractTotalCostUsd(finalUsage);
					if (totalCostUsd) {
						mergedMeta.total_cost_usd = totalCostUsd;
					}

					assistantContent = reply;
					if (shouldDebug) {
						// eslint-disable-next-line no-console
						console.log("[chat] non-stream final usage/meta", {
							usage: finalUsage,
							meta: mergedMeta,
						});
					}
					if (placeholderReady) {
						latestThread = updateAssistantVariant(
							latestThread,
							assistantId,
							variantIndex,
							assistantContent,
							finalUsage,
							mergedMeta,
						);
						await updateThreadState(latestThread, !temporaryMode);
						return;
					}
					return;
				}

				let buffer = "";

				if (targetAssistantId) {
					const initialVariant = {
						id: generateId(),
						content: "",
						createdAt: nowIso(),
					};
					const result = appendAssistantVariant(
						latestThread,
						targetAssistantId,
						initialVariant,
					);
					latestThread = result.nextThread;
					variantIndex = result.variantIndex;
					await updateThreadState(latestThread, false);
				} else {
					const orgId = getOrgId(thread.modelId);
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "",
						createdAt: nowIso(),
						modelId: thread.modelId,
						providerId: thread.settings.providerId,
						providerName:
							orgNameById[orgId] ?? formatOrgLabel(orgId),
						variants: [
							{
								id: assistantId,
								content: "",
								createdAt: nowIso(),
							},
						],
						activeVariantIndex: 0,
					};
					latestThread = {
						...thread,
						messages: [...thread.messages, assistantMessage],
						updatedAt: nowIso(),
					};
					await updateThreadState(latestThread, false);
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				const streamFrameDelayMs = 50;
				let flushTimer: number | null = null;
				let pendingMetaPartial: Record<string, unknown> | undefined;
				let lastFlushAt = 0;
				let flushPromise = Promise.resolve();
				const scheduleUpdate = (
					metaPartial?: Record<string, unknown>,
				) => {
					if (metaPartial) {
						pendingMetaPartial = metaPartial;
					}
					if (flushTimer != null) return;
					const now = performance.now();
					const elapsed = now - lastFlushAt;
					const delay =
						elapsed >= streamFrameDelayMs
							? 0
							: streamFrameDelayMs - elapsed;
					flushTimer = window.setTimeout(() => {
						flushTimer = null;
						lastFlushAt = performance.now();
						const meta = pendingMetaPartial;
						pendingMetaPartial = undefined;
						flushPromise = flushPromise.then(async () => {
							latestThread = updateAssistantVariant(
								latestThread,
								assistantId,
								variantIndex,
								assistantContent,
								undefined,
								meta,
							);
							await updateThreadState(latestThread, false);
						});
					}, delay);
				};
				let reasoningContent = "";
				const reasoningSummaries: Record<number, string> = {};

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const frames = buffer.split(/\r?\n\r?\n/);
					buffer = frames.pop() ?? "";
					for (const frame of frames) {
						if (!firstTokenAt) {
							firstTokenAt = performance.now();
						}
						const lines = frame.split(/\r?\n/);
						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed.startsWith("data:")) continue;
							const data = trimmed.slice(5).trim();
							if (!data || data === "[DONE]") continue;
							try {
								const parsed = JSON.parse(data);
								if (parsed?.usage || parsed?.response?.usage) {
									finalUsage =
										parsed?.usage ??
										parsed?.response?.usage ??
										null;
									if (shouldDebug) {
										// eslint-disable-next-line no-console
										console.log(
											"[chat] stream usage",
											finalUsage,
										);
									}
								}
								if (parsed?.meta || parsed?.response?.meta) {
									finalMeta =
										parsed?.meta ??
										parsed?.response?.meta ??
										null;
								}
								let responseText = "";
								let delta = "";
								let reasoningDelta = "";
								let reasoningUpdated = false;
								let summaryUpdated = false;
								const summaryIndex =
									typeof parsed?.summary_index === "number"
										? parsed.summary_index
										: typeof parsed?.summaryIndex ===
											  "number"
											? parsed.summaryIndex
											: null;
								const appendSummaryDelta = (
									deltaText: string,
								) => {
									if (summaryIndex == null) return false;
									const previous =
										reasoningSummaries[summaryIndex] ?? "";
									const next = previous + deltaText;
									if (next === previous) return false;
									reasoningSummaries[summaryIndex] = next;
									return true;
								};
								const setSummaryText = (text: string) => {
									if (summaryIndex == null) return false;
									if (
										reasoningSummaries[summaryIndex] ===
										text
									)
										return false;
									reasoningSummaries[summaryIndex] = text;
									return true;
								};
								const rebuildSummaryText = () => {
									const indices = Object.keys(
										reasoningSummaries,
									)
										.map((value) => Number(value))
										.filter((value) =>
											Number.isFinite(value),
										)
										.sort((a, b) => a - b);
									return indices
										.map(
											(index) =>
												reasoningSummaries[index],
										)
										.filter(Boolean)
										.join("\n\n");
								};
								const frameType = parsed?.type;
								if (
									frameType === "response.output_text.delta"
								) {
									if (typeof parsed?.delta === "string") {
										delta = parsed.delta;
									}
								} else if (
									frameType === "response.reasoning.delta"
								) {
									if (typeof parsed?.delta === "string") {
										reasoningDelta = parsed.delta;
									}
								} else if (
									frameType ===
										"response.output_item.delta" &&
									parsed?.item?.type === "reasoning"
								) {
									const deltaText =
										parsed?.delta?.text ??
										parsed?.delta?.content ??
										parsed?.delta;
									if (typeof deltaText === "string") {
										reasoningDelta = deltaText;
									}
								} else if (
									frameType ===
									"response.reasoning_summary_text.delta"
								) {
									if (typeof parsed?.delta === "string") {
										summaryUpdated =
											appendSummaryDelta(parsed.delta) ||
											summaryUpdated;
									}
								} else if (
									frameType ===
									"response.reasoning_summary_text.done"
								) {
									if (typeof parsed?.text === "string") {
										summaryUpdated =
											setSummaryText(parsed.text) ||
											summaryUpdated;
									}
								} else if (
									frameType ===
									"response.reasoning_summary_part.done"
								) {
									const partText = parsed?.part?.text;
									if (
										typeof partText === "string" &&
										partText
									) {
										if (
											summaryIndex != null &&
											!reasoningSummaries[summaryIndex]
										) {
											summaryUpdated =
												setSummaryText(partText) ||
												summaryUpdated;
										}
									}
								} else if (
									frameType === "response.output_text.done"
								) {
									if (typeof parsed?.text === "string") {
										responseText = parsed.text;
									}
								} else if (frameType === "response.completed") {
									responseText = extractResponseText(
										parsed?.response ?? parsed,
									);
									if (!reasoningContent) {
										reasoningContent = extractReasoningText(
											parsed?.response ?? parsed,
										);
									}
								} else {
									const responseDelta =
										typeof parsed?.delta === "string"
											? parsed.delta
											: typeof parsed?.text === "string"
												? parsed.text
												: "";
									responseText =
										coerceResponseText(
											parsed?.response?.output_text,
										) ||
										coerceResponseText(parsed?.output_text);
									delta =
										parsed?.choices?.[0]?.delta?.content ??
										parsed?.choices?.[0]?.message
											?.content ??
										responseDelta ??
										"";
								}
								if (summaryUpdated) {
									reasoningContent = rebuildSummaryText();
									reasoningUpdated = true;
								}
								const hasSummary =
									Object.keys(reasoningSummaries).length > 0;
								if (delta) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									assistantContent += delta;
									if (reasoningDelta && !hasSummary) {
										if (
											!reasoningContent.endsWith(
												reasoningDelta,
											)
										) {
											reasoningContent += reasoningDelta;
										}
									}
									const metaPartial = reasoningContent
										? {
												...(finalMeta ?? {}),
												reasoning_text:
													reasoningContent,
											}
										: undefined;
									scheduleUpdate(metaPartial);
								} else if (reasoningDelta && !hasSummary) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									if (
										!reasoningContent.endsWith(
											reasoningDelta,
										)
									) {
										reasoningContent += reasoningDelta;
									}
									scheduleUpdate({
										...(finalMeta ?? {}),
										reasoning_text: reasoningContent,
									});
								} else if (reasoningUpdated) {
									scheduleUpdate({
										...(finalMeta ?? {}),
										reasoning_text: reasoningContent,
									});
								} else if (
									responseText &&
									responseText !== assistantContent
								) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									assistantContent = responseText;
									const metaPartial = reasoningContent
										? {
												...(finalMeta ?? {}),
												reasoning_text:
													reasoningContent,
											}
										: undefined;
									scheduleUpdate(metaPartial);
								}
							} catch {
								// ignore malformed chunks
							}
						}
					}
				}

				const clientMeta = buildClientMeta(performance.now());
				const mergedMeta = mergeMeta(clientMeta);
				if (reasoningContent) {
					mergedMeta.reasoning_text = reasoningContent;
				}
				const totalCostUsd = extractTotalCostUsd(finalUsage);
				if (totalCostUsd) {
					mergedMeta.total_cost_usd = totalCostUsd;
				}
				if (shouldDebug) {
					// eslint-disable-next-line no-console
					console.log("[chat] stream final usage/meta", {
						usage: finalUsage,
						meta: mergedMeta,
					});
				}
				latestThread = updateAssistantVariant(
					latestThread,
					assistantId,
					variantIndex,
					assistantContent,
					finalUsage,
					mergedMeta,
				);

				await updateThreadState(latestThread, !temporaryMode);
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to send message.";
				setError(message);
				if (latestThread) {
					const errorContent = `Error: ${message}`;
					if (placeholderReady) {
						latestThread = updateAssistantVariant(
							latestThread,
							assistantId,
							variantIndex,
							errorContent,
						);
					} else {
						const orgId = getOrgId(latestThread.modelId);
						const errorMessage: ChatMessage = {
							id: generateId(),
							role: "assistant",
							content: errorContent,
							createdAt: nowIso(),
							modelId: latestThread.modelId,
							providerId: latestThread.settings.providerId,
							providerName:
								orgNameById[orgId] ?? formatOrgLabel(orgId),
							variants: [
								{
									id: generateId(),
									content: errorContent,
									createdAt: nowIso(),
								},
							],
							activeVariantIndex: 0,
						};
						latestThread = {
							...latestThread,
							messages: [...latestThread.messages, errorMessage],
							updatedAt: nowIso(),
						};
					}
					await updateThreadState(latestThread, !temporaryMode);
				}
			} finally {
				setIsSending(false);
			}
		},
		[
			apiKey,
			baseUrl,
			personalization,
			shouldDebug,
			appendAssistantVariant,
			orgNameById,
			temporaryMode,
			updateAssistantVariant,
			updateThreadState,
		],
	);

	const handleSend = useCallback(
		async (overrideContent: string) => {
			if (!activeThread || isSending) return;
			const content = overrideContent.trim();
			if (!content) return;
			if (!isAuthenticated) {
				setError("Sign in to start chatting.");
				return;
			}
			if (!apiKey.trim()) {
				setError("Add an API key in settings before sending.");
				setSettingsOpen(true);
				return;
			}
			if (!activeThread.modelId) {
				setError("Select a model to start chatting.");
				setModelPickerOpen(true);
				return;
			}

			const userMessage: ChatMessage = {
				id: generateId(),
				role: "user",
				content,
				createdAt: nowIso(),
			};

			const nextTitle = activeThread.titleLocked
				? activeThread.title
				: buildTitle([...(activeThread.messages ?? []), userMessage]);

			const updatedThread: ChatThread = {
				...activeThread,
				title: nextTitle,
				messages: [...activeThread.messages, userMessage],
				updatedAt: nowIso(),
			};

			await updateThreadState(updatedThread, !temporaryMode);

			await executeCompletion(updatedThread, updatedThread.messages);
		},
		[
			activeThread,
			apiKey,
			executeCompletion,
			isSending,
			isAuthenticated,
			temporaryMode,
			updateThreadState,
		],
	);

	const handleEditMessage = useCallback(
		(messageId: string, content: string) => {
			if (!activeThread) return;
			const nextThread = applyMessageUpdate(
				activeThread,
				messageId,
				(message) => ({
					...message,
					content,
				}),
			);
			updateThreadState(nextThread, !temporaryMode);
		},
		[activeThread, applyMessageUpdate, temporaryMode, updateThreadState],
	);

	const handleSelectVariant = useCallback(
		(messageId: string, variantIndex: number) => {
			if (!activeThread) return;
			const message = activeThread.messages.find(
				(entry) => entry.id === messageId,
			);
			if (!message) return;
			const variants = ensureVariants(message);
			const selected = variants[variantIndex];
			if (!selected) return;
			const nextThread = updateAssistantVariant(
				activeThread,
				messageId,
				variantIndex,
				selected.content,
				selected.usage ?? null,
				selected.meta ?? null,
			);
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			temporaryMode,
			updateAssistantVariant,
			updateThreadState,
		],
	);

	const handleRetryAssistant = useCallback(
		async (messageId: string) => {
			if (!activeThread || isSending) return;
			if (!isAuthenticated) {
				setError("Sign in to start chatting.");
				return;
			}
			if (!apiKey.trim()) {
				setError("Add an API key in settings before sending.");
				setSettingsOpen(true);
				return;
			}
			const messageIndex = activeThread.messages.findIndex(
				(message) => message.id === messageId,
			);
			if (messageIndex < 0) return;
			const contextMessages = activeThread.messages.slice(
				0,
				messageIndex,
			);
			await executeCompletion(activeThread, contextMessages, messageId);
		},
		[activeThread, apiKey, executeCompletion, isAuthenticated, isSending],
	);
	const handleBranchAssistant = useCallback(
		async (messageId: string) => {
			if (!activeThread) return;
			const messageIndex = activeThread.messages.findIndex(
				(message) => message.id === messageId,
			);
			if (messageIndex < 0) return;
			setError(null);
			const createdAt = nowIso();
			const branchTitle = `Branch: ${activeThread.title || "New chat"}`;
			const messages = activeThread.messages
				.slice(0, messageIndex + 1)
				.map((message) => ({
					...message,
					usage: message.usage ?? null,
					meta: message.meta ?? null,
					variants: message.variants
						? message.variants.map((variant) => ({
								...variant,
								usage: variant.usage ?? null,
								meta: variant.meta ?? null,
							}))
						: undefined,
				}));
			const newThread: ChatThread = {
				id: generateId(),
				title: branchTitle,
				titleLocked: false,
				pinned: false,
				modelId: activeThread.modelId,
				createdAt,
				updatedAt: createdAt,
				messages,
				settings: { ...activeThread.settings },
			};
			await upsertChat(newThread);
			setThreads((prev) => [newThread, ...prev]);
			setActiveThread(newThread);
		},
		[activeThread, setActiveThread],
	);
	const updateActiveSettings = useCallback(
		(partial: Partial<ChatSettings>) => {
			if (!activeThread) return;
			const nextThread = {
				...activeThread,
				settings: { ...activeThread.settings, ...partial },
				updatedAt: nowIso(),
			};
			updateThreadState(nextThread, !temporaryMode);
		},
		[activeThread, temporaryMode, updateThreadState],
	);

	const updateSettingNumber = useCallback(
		(key: keyof ChatSettings, value: number | null) => {
			updateActiveSettings({ [key]: value } as Partial<ChatSettings>);
		},
		[updateActiveSettings],
	);

	const updateActiveModel = useCallback(
		(modelId: string) => {
			if (!activeThread) return;
			const previousDefault = buildDefaultSystemPrompt(
				activeThread.modelId,
			);
			const nextSystemPrompt =
				!activeThread.settings.systemPrompt ||
				activeThread.settings.systemPrompt === previousDefault
					? buildDefaultSystemPrompt(modelId)
					: activeThread.settings.systemPrompt;
			const nextThread = {
				...activeThread,
				modelId,
				settings: {
					...activeThread.settings,
					systemPrompt: nextSystemPrompt,
				},
				updatedAt: nowIso(),
			};
			setLastModelId(modelId);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEYS.lastModelId, modelId);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[activeThread, temporaryMode, updateThreadState],
	);

	useEffect(() => {
		if (!queryModelIsValid || !queryModelId || !activeThread) return;
		if (activeThread.modelId === queryModelId) return;
		updateActiveModel(queryModelId);
	}, [activeThread, queryModelId, queryModelIsValid, updateActiveModel]);

	const handleDeleteThread = async () => {
		if (!deleteTarget) return;
		const threadId = deleteTarget.id;
		await deleteChat(threadId);
		setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
		if (activeId === threadId) {
			const remaining = threads.filter(
				(thread) => thread.id !== threadId,
			);
			setActiveId(remaining[0]?.id ?? null);
		}
		setDeleteOpen(false);
		setDeleteTarget(null);
	};

	const requestDeleteThread = (thread: ChatThread) => {
		setDeleteTarget(thread);
		setDeleteOpen(true);
	};

	const handleDeleteOpenChange = (open: boolean) => {
		setDeleteOpen(open);
		if (!open) {
			setDeleteTarget(null);
		}
	};

	const handleRename = (thread: ChatThread) => {
		setRenameTargetId(thread.id);
		setRenameValue(thread.title);
		setRenameOpen(true);
	};

	const handleRenameSave = async () => {
		if (!renameTargetId) return;
		const trimmed = renameValue.trim();
		if (!trimmed) return;
		const thread = threads.find((t) => t.id === renameTargetId);
		if (!thread) return;
		await updateStoredThread({
			...thread,
			title: trimmed,
			titleLocked: true,
			updatedAt: nowIso(),
		});
		setRenameOpen(false);
	};

	const handlePinToggle = async (thread: ChatThread) => {
		await updateStoredThread({
			...thread,
			pinned: !thread.pinned,
			updatedAt: nowIso(),
		});
	};

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setPreviousStoredId(activeId);
			setTemporaryMode(true);
			setTemporaryThread({
				id: TEMP_CHAT_ID,
				title: "Temporary chat",
				titleLocked: true,
				modelId: activeThread?.modelId ?? defaultModelId,
				createdAt: nowIso(),
				updatedAt: nowIso(),
				messages: [],
				settings: activeThread?.settings ?? { ...DEFAULT_SETTINGS },
			});
			return;
		}
		setTemporaryMode(false);
		setTemporaryThread(null);
		if (previousStoredId) {
			setActiveId(previousStoredId);
		}
	};

	const selectedOrgId = activeThread?.modelId
		? getOrgId(activeThread.modelId)
		: "ai-stats";
	const selectedModelLabel = activeThread?.modelId
		? formatModelLabel(activeThread.modelId)
		: "Select model";
	const temperatureValue = activeThread?.settings.temperature ?? 0.7;
	const maxTokensValue = activeThread?.settings.maxOutputTokens ?? 800;
	const topPValue = activeThread?.settings.topP ?? 1;
	const topKValue = activeThread?.settings.topK ?? 40;
	const minPValue = activeThread?.settings.minP ?? 0;
	const topAValue = activeThread?.settings.topA ?? 0;
	const frequencyValue = activeThread?.settings.frequencyPenalty ?? 0;
	const presenceValue = activeThread?.settings.presencePenalty ?? 0;
	const repetitionValue = activeThread?.settings.repetitionPenalty ?? 1;

	return (
		<div className="flex min-h-screen w-full bg-background text-foreground overflow-x-hidden">
			<Sidebar className="border-r border-border bg-background">
				<ChatSidebar
					groupedThreads={groupedThreads}
					threads={threads}
					activeId={activeId}
					temporaryMode={temporaryMode}
					onCreateThread={createThread}
					onSearch={() => setSearchOpen(true)}
					onSelectThread={setActiveThread}
					onRenameThread={handleRename}
					onPinToggle={handlePinToggle}
					onRequestDelete={requestDeleteThread}
					authUser={authUser}
					authLoading={authLoading}
					onSignOut={handleSignOut}
				/>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="flex h-dvh min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
				<ChatHeader
					activeThread={activeThread}
					modelOptions={modelOptions}
					selectedOrgId={selectedOrgId}
					selectedModelLabel={selectedModelLabel}
					modelPickerOpen={modelPickerOpen}
					onModelPickerOpenChange={setModelPickerOpen}
					onUpdateModel={updateActiveModel}
					temporaryMode={temporaryMode}
					onToggleTemporaryMode={toggleTemporaryMode}
					onOpenModelSettings={() => setModelSettingsOpen(true)}
					settingsOpen={settingsOpen}
					onSettingsOpenChange={setSettingsOpen}
					apiKey={apiKey}
					baseUrl={baseUrl}
					onApiKeyChange={setApiKey}
					onBaseUrlChange={setBaseUrl}
					onSaveSettings={handleSaveSettings}
					personalization={personalization}
					onPersonalizationChange={setPersonalization}
					onExportChats={handleExportChats}
					isAdmin={isAdmin}
					debugEnabled={debugEnabled}
					onDebugChange={handleDebugChange}
				/>
				<ChatConversation
					activeThread={activeThread}
					isSending={isSending}
					presetPrompt={queryPrompt}
					onSend={handleSend}
					onEditMessage={handleEditMessage}
					onRetryAssistant={handleRetryAssistant}
					onBranchAssistant={handleBranchAssistant}
					onSelectVariant={handleSelectVariant}
					orgNameById={orgNameById}
					isAuthenticated={isAuthenticated}
					hasApiKey={hasApiKey}
					accentColor={personalization.accentColor}
					selectedOrgId={selectedOrgId}
					selectedModelLabel={selectedModelLabel}
					onOpenModelPicker={() => setModelPickerOpen(true)}
					onOpenSettings={() => setSettingsOpen(true)}
				/>
			</SidebarInset>
			<ModelSettingsDialog
				open={modelSettingsOpen}
				onOpenChange={setModelSettingsOpen}
				settings={activeThread?.settings ?? DEFAULT_SETTINGS}
				providerOptions={providerOptions}
				temperatureValue={temperatureValue}
				maxTokensValue={maxTokensValue}
				topPValue={topPValue}
				topKValue={topKValue}
				minPValue={minPValue}
				topAValue={topAValue}
				frequencyValue={frequencyValue}
				presenceValue={presenceValue}
				repetitionValue={repetitionValue}
				onUpdate={updateActiveSettings}
				onUpdateNumber={updateSettingNumber}
			/>
			<ChatSearchDialog
				open={searchOpen}
				onOpenChange={setSearchOpen}
				threads={sortedThreads}
				onSelectThread={(thread) => {
					setActiveThread(thread);
					setSearchOpen(false);
				}}
			/>
			<ChatRenameDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				value={renameValue}
				onChange={setRenameValue}
				onSave={handleRenameSave}
			/>
			<ChatDeleteDialog
				open={deleteOpen}
				onOpenChange={handleDeleteOpenChange}
				onConfirm={handleDeleteThread}
			/>
			<ChatNewChatDialog
				open={newChatDialogOpen}
				changes={pendingNewChat?.changes ?? []}
				onOpenChange={(open) => {
					setNewChatDialogOpen(open);
					if (!open) {
						setPendingNewChat(null);
					}
				}}
				onUseCurrent={() => handleNewChatDecision(true)}
				onUseDefaults={() => handleNewChatDecision(false)}
			/>
		</div>
	);
}

export default function ChatPlayground(props: ChatPlaygroundProps) {
	return (
		<SidebarProvider defaultOpen className="h-dvh overflow-hidden">
			<ChatPlaygroundContent {...props} />
		</SidebarProvider>
	);
}
