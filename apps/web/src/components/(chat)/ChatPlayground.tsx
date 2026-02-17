"use client";

import Link from "next/link";
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
	ChatModelSettings,
	ChatSettings,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";
import { deleteChat, getAllChats, upsertChat } from "@/lib/indexeddb/chats";
import { FEATURED_MODEL_IDS } from "@/components/(chat)/playgroundConfig";
import {
	ChatConversation,
	type ChatSendPayload,
} from "@/components/(chat)/ChatConversation";
import { ChatHeader } from "@/components/(chat)/ChatHeader";
import { ModelSettingsDialog } from "@/components/(chat)/ModelSettingsDialog";
import { ChatSearchDialog } from "@/components/(chat)/ChatSearchDialog";
import { ChatRenameDialog } from "@/components/(chat)/ChatRenameDialog";
import { ChatDeleteDialog } from "@/components/(chat)/ChatDeleteDialog";
import { ChatNewChatDialog } from "@/components/(chat)/ChatNewChatDialog";
import {
	coerceResponseText,
	appendImagesToText,
	extractResponseImages,
	extractReasoningText,
	extractResponseText,
} from "@/components/(chat)/chatPayload";
import {
	buildUserMessageContent,
	prepareAttachments,
	prepareInlineAttachmentPreviews,
	type PreparedAttachment,
} from "@/components/(chat)/playground/attachment-utils";
import {
	AUDIO_INPUT_MODEL_HINTS,
	capabilityIdsToUnifiedEndpoints,
	getPrimaryUnifiedCapability,
	inferModelCapabilityEndpoint,
	inferUnifiedEndpoint,
	supportsAudioInputByCapabilities,
} from "@/components/(chat)/playground/capability-utils";
import {
	APP_HEADERS,
	COMPLETED_STATUSES,
	DEFAULT_SETTINGS,
	PENDING_STATUSES,
	STORAGE_KEYS,
	TEMP_CHAT_ID,
	buildDefaultSystemPrompt,
	buildPersonalizationPrompt,
	buildTitle,
	ensureModelOverridesForIds,
	ensureVariants,
	extractGenerationResourceId,
	extractTotalCostUsd,
	extractUnifiedMediaUrl,
	formatModelLabel,
	formatOrgLabel,
	generateId,
	getChangedSettings,
	getEffectiveModelSettings,
	getEndpointResultLabel,
	getOrgId,
	isModelExpired,
	normalizeBaseUrl,
	normalizeGenerationStatus,
	nowIso,
	shouldRequestImageModalities,
	wait,
	type ModelOption,
	type PersonalizationSettings,
	type SettingChange,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	ChatSidebar,
	type GroupedThreads,
} from "@/components/(chat)/ChatSidebar";

type ChatPlaygroundProps = {
	models: GatewaySupportedModel[];
	modelParam?: string | null;
	promptParam?: string | null;
	mode?: "classic" | "unified";
};

type ChatUser = {
	id: string;
	email: string | null;
	name: string;
	avatarUrl: string | null;
};

const CHAT_BETA_ISSUES_HREF =
	"https://github.com/AI-Stats/AI-Stats/issues/new/choose";

function ChatPlaygroundContent({
	models,
	modelParam,
	promptParam,
	mode = "classic",
}: ChatPlaygroundProps) {
	const isUnified = mode === "unified";
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
	const [modelSettingsTargetModelId, setModelSettingsTargetModelId] =
		useState<string | null>(null);
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
	const [composerRequiresAudioInput, setComposerRequiresAudioInput] =
		useState(false);
	const [temporaryThread, setTemporaryThread] = useState<ChatThread | null>(
		null,
	);
	const [previousStoredId, setPreviousStoredId] = useState<string | null>(
		null,
	);
	const [groupingNowMs, setGroupingNowMs] = useState<number | null>(null);

	const selectableModels = useMemo(
		() => models.filter((model) => !isModelExpired(model)),
		[models],
	);
	const defaultModelId = selectableModels[0]?.modelId ?? "";
	const [lastModelId, setLastModelId] = useState(defaultModelId);
	const queryModelId = (modelParam ?? "").trim();
	const queryPrompt = promptParam ?? "";
	const selectableModelIdSet = useMemo(
		() => new Set(selectableModels.map((model) => model.modelId)),
		[selectableModels],
	);
	const queryModelIsValid = useMemo(() => {
		if (!queryModelId) return false;
		return selectableModelIdSet.has(queryModelId);
	}, [queryModelId, selectableModelIdSet]);
	const [personalization, setPersonalization] =
		useState<PersonalizationSettings>({
			name: "",
			role: "",
			notes: "",
			accentColor: "#111111",
		});

	const modelOptions = useMemo(() => {
		const map = new Map<string, ModelOption>();

		for (const model of selectableModels) {
			const existing = map.get(model.modelId);
			const orgId = getOrgId(model.modelId);
			const orgName =
				model.organisationName ??
				model.providerName ??
				formatOrgLabel(orgId);
			const label = model.modelName ?? formatModelLabel(model.modelId);
			const releaseDate =
				model.releaseDate ?? model.announcementDate ?? null;
			const rowCapabilityEndpoints = capabilityIdsToUnifiedEndpoints(
				model.capabilities,
			);

			if (!existing) {
				map.set(model.modelId, {
					modelId: model.modelId,
					orgId,
					orgName,
					label,
					capabilityEndpoints:
						rowCapabilityEndpoints.length > 0
							? rowCapabilityEndpoints
							: [inferModelCapabilityEndpoint(model.modelId)],
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
				for (const endpoint of rowCapabilityEndpoints) {
					if (!existing.capabilityEndpoints.includes(endpoint)) {
						existing.capabilityEndpoints.push(endpoint);
					}
				}
			}
		}

		const options = Array.from(map.values()).map((option) => ({
			...option,
			capabilityEndpoints:
				option.capabilityEndpoints.length > 0
					? option.capabilityEndpoints
					: [inferModelCapabilityEndpoint(option.modelId)],
			gatewayStatus: Object.values(option.providerAvailability).some(
				Boolean,
			)
				? ("active" as const)
				: ("inactive" as const),
		}));
		const featured: ModelOption[] = [];
		const grouped = new Map<string, ModelOption[]>();
		const comingSoon = new Map<string, ModelOption[]>();
		for (const option of options) {
			const isFeatured = FEATURED_MODEL_IDS.includes(option.modelId);
			if (isFeatured && option.gatewayStatus === "active") {
				featured.push(option);
				continue;
			}
			if (option.gatewayStatus === "inactive") {
				const list = comingSoon.get(option.orgId) ?? [];
				list.push(option);
				comingSoon.set(option.orgId, list);
			} else {
				const list = grouped.get(option.orgId) ?? [];
				list.push(option);
				grouped.set(option.orgId, list);
			}
		}

		for (const list of grouped.values()) {
			list.sort((a, b) => a.label.localeCompare(b.label));
		}

		for (const list of comingSoon.values()) {
			list.sort((a, b) => a.label.localeCompare(b.label));
		}

		featured.sort((a, b) => {
			const orgCompare = a.orgName.localeCompare(b.orgName);
			if (orgCompare !== 0) return orgCompare;
			return a.label.localeCompare(b.label);
		});

		const sortGroupsByOrgName = (source: Map<string, ModelOption[]>) => {
			const entries = Array.from(source.entries());
			entries.sort(([, aList], [, bList]) => {
				const aName =
					aList[0]?.orgName ?? formatOrgLabel(aList[0]?.orgId ?? "");
				const bName =
					bList[0]?.orgName ?? formatOrgLabel(bList[0]?.orgId ?? "");
				return aName.localeCompare(bName);
			});
			return new Map(entries);
		};

		return {
			featured,
			grouped: sortGroupsByOrgName(grouped),
			comingSoon: sortGroupsByOrgName(comingSoon),
		};
	}, [selectableModels]);
	const modelCapabilitiesById = useMemo(() => {
		const capabilityById: Record<string, UnifiedChatEndpoint[]> = {};
		const setForModel = (
			modelId: string,
			endpoints: UnifiedChatEndpoint[],
		) => {
			const existing = capabilityById[modelId] ?? [];
			const next = new Set<UnifiedChatEndpoint>(existing);
			for (const endpoint of endpoints) {
				next.add(endpoint);
			}
			capabilityById[modelId] = Array.from(next);
		};
		for (const option of modelOptions.featured) {
			setForModel(option.modelId, option.capabilityEndpoints);
		}
		for (const list of modelOptions.grouped.values()) {
			for (const option of list) {
				setForModel(option.modelId, option.capabilityEndpoints);
			}
		}
		for (const list of modelOptions.comingSoon.values()) {
			for (const option of list) {
				setForModel(option.modelId, option.capabilityEndpoints);
			}
		}
		for (const modelId of Object.keys(capabilityById)) {
			if (capabilityById[modelId].length === 0) {
				capabilityById[modelId] = [
					inferModelCapabilityEndpoint(modelId),
				];
			}
		}
		return capabilityById;
	}, [modelOptions.comingSoon, modelOptions.featured, modelOptions.grouped]);

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
	for (const model of selectableModels) {
		const orgId = getOrgId(model.modelId);
		if (!map[orgId]) {
				map[orgId] =
					model.organisationName ??
					model.providerName ??
					formatOrgLabel(orgId);
			}
		}
		return map;
	}, [selectableModels]);

	const activeThread = useMemo(() => {
		if (temporaryMode && temporaryThread) return temporaryThread;
		return threads.find((thread) => thread.id === activeId) ?? null;
	}, [temporaryMode, temporaryThread, threads, activeId]);
	const getModelCapabilities = useCallback(
		(modelId: string): UnifiedChatEndpoint[] =>
			modelCapabilitiesById[modelId] ?? [inferModelCapabilityEndpoint(modelId)],
		[modelCapabilitiesById],
	);
	const modelSupportsAudioInputById = useMemo(() => {
		const supportById: Record<string, boolean> = {};
		for (const model of selectableModels) {
			const fromCapabilities = supportsAudioInputByCapabilities(
				model.capabilities,
			);
			const normalizedModelId = model.modelId.toLowerCase();
			const fromModelId = AUDIO_INPUT_MODEL_HINTS.some((hint) =>
				normalizedModelId.includes(hint),
			);
			supportById[model.modelId] = fromCapabilities || fromModelId;
		}
		return supportById;
	}, [selectableModels]);
	const supportsModelAudioInput = useCallback(
		(modelId: string) => Boolean(modelSupportsAudioInputById[modelId]),
		[modelSupportsAudioInputById],
	);
	const isModelCapabilityCompatible = useCallback(
		(modelId: string, requiredCapability: UnifiedChatEndpoint) =>
			getModelCapabilities(modelId).includes(requiredCapability),
		[getModelCapabilities],
	);
	const isModelSelectableForContext = useCallback(
		(
			modelId: string,
			requiredCapability: UnifiedChatEndpoint,
			requiresAudioInput: boolean,
		) =>
			isModelCapabilityCompatible(modelId, requiredCapability) &&
			(!requiresAudioInput || supportsModelAudioInput(modelId)),
		[isModelCapabilityCompatible, supportsModelAudioInput],
	);
	const getPrimaryCapabilityForModel = useCallback(
		(modelId: string): UnifiedChatEndpoint =>
			getPrimaryUnifiedCapability(getModelCapabilities(modelId)),
		[getModelCapabilities],
	);
	const activeModelCapability = useMemo(() => {
		if (!isUnified || !activeThread?.modelId) return null;
		return getPrimaryCapabilityForModel(activeThread.modelId);
	}, [getPrimaryCapabilityForModel, isUnified, activeThread?.modelId]);

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

		const fallbackAnchorMs = Date.parse(sortedThreads[0]?.updatedAt ?? "");
		const anchorMs =
			groupingNowMs ?? (Number.isFinite(fallbackAnchorMs) ? fallbackAnchorMs : null);
		if (anchorMs == null) {
			return groups;
		}

		const now = new Date(anchorMs);
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);
		const startOfYesterday = new Date(startOfToday);
		startOfYesterday.setDate(startOfToday.getDate() - 1);
		const startOfWeek = new Date(startOfToday);
		const weekday = (startOfToday.getDay() + 6) % 7;
		startOfWeek.setDate(startOfToday.getDate() - weekday);
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfTodayMs = startOfToday.getTime();
		const startOfYesterdayMs = startOfYesterday.getTime();
		const startOfWeekMs = startOfWeek.getTime();
		const startOfMonthMs = startOfMonth.getTime();

		for (const thread of sortedThreads) {
			if (thread.pinned) {
				groups.pinned.push(thread);
				continue;
			}
			const updatedMs = Date.parse(thread.updatedAt);
			if (!Number.isFinite(updatedMs)) {
				groups.older.push(thread);
				continue;
			}
			if (updatedMs >= startOfTodayMs) {
				groups.today.push(thread);
			} else if (updatedMs >= startOfYesterdayMs) {
				groups.yesterday.push(thread);
			} else if (updatedMs >= startOfWeekMs) {
				groups.week.push(thread);
			} else if (updatedMs >= startOfMonthMs) {
				groups.month.push(thread);
			} else {
				groups.older.push(thread);
			}
		}

		return groups;
	}, [groupingNowMs, sortedThreads]);

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
		setGroupingNowMs(Date.now());
	}, []);

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
			const modelOverridesById = ensureModelOverridesForIds(settings, [
				modelId,
				...(settings.compareModelIds ?? []),
			]);
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
					modelOverridesById,
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
			let threadToPersist = nextThread;
			setThreads((prev) =>
				prev.map((thread) => {
					if (thread.id !== nextThread.id) {
						return thread;
					}
					const currentById = new Map(
						thread.messages.map((message) => [message.id, message]),
					);
					const nextById = new Map(
						nextThread.messages.map((message) => [message.id, message]),
					);
					const orderedIds = thread.messages.map((message) => message.id);
					for (const message of nextThread.messages) {
						if (!currentById.has(message.id)) {
							orderedIds.push(message.id);
						}
					}
					const mergedMessages = orderedIds
						.map((id) => nextById.get(id) ?? currentById.get(id))
						.filter((message): message is ChatMessage => Boolean(message));
					threadToPersist = {
						...thread,
						...nextThread,
						messages: mergedMessages,
						updatedAt:
							nextThread.updatedAt > thread.updatedAt
								? nextThread.updatedAt
								: thread.updatedAt,
					};
					return threadToPersist;
				}),
			);
			if (persist) {
				await persistThread(threadToPersist);
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
			sendPayload?: ChatSendPayload,
			compareGroupId?: string,
			requestModelId?: string,
			manageSendingState = true,
		) => {
			const payloadMessages = [] as Array<{
				role: string;
				content: string;
			}>;
			const effectiveModelId = requestModelId ?? thread.modelId;
			const compareMeta = compareGroupId
				? { compare_group_id: compareGroupId }
				: null;
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
			const preparedAttachments =
				sendPayload?.attachments?.length
					? await prepareAttachments(sendPayload.attachments)
					: [];
			const latestUserPrompt =
				[...contextMessages]
					.reverse()
					.find((msg) => msg.role === "user")
					?.content.trim() ||
				sendPayload?.content.trim() ||
				"";
			const endpoint: UnifiedChatEndpoint = isUnified
				? inferUnifiedEndpoint({
						modelId: effectiveModelId,
						defaultCapability:
							getPrimaryCapabilityForModel(effectiveModelId),
					})
				: "responses";
			const wantsImageModalities =
				endpoint === "responses" &&
				(thread.settings.imageOutputEnabled ||
					shouldRequestImageModalities(effectiveModelId));
			const streamEnabled =
				endpoint === "responses" &&
				Boolean(thread.settings.stream) &&
				!wantsImageModalities;
			const input = payloadMessages
				.filter((message) => message.content.trim().length > 0)
				.map((message, index) => {
					const isLatestUserTurn =
						message.role === "user" &&
						index === payloadMessages.length - 1;
					if (
						!isLatestUserTurn ||
						endpoint !== "responses" ||
						!preparedAttachments.length
					) {
						return {
							role: message.role,
							content: message.content,
						};
					}
					const contentParts: Array<Record<string, unknown>> = [];
					const latestMessageText = sendPayload?.content?.trim() ?? "";
					if (latestMessageText) {
						contentParts.push({
							type: "input_text",
							text: latestMessageText,
						});
					}
					for (const attachment of preparedAttachments) {
						if (attachment.isImage) {
							contentParts.push({
								type: "input_image",
								image_url: attachment.dataUrl,
							});
						} else if (attachment.isAudio) {
							const data = attachment.dataUrl.includes(",")
								? attachment.dataUrl.split(",")[1] ?? ""
								: attachment.dataUrl;
							const formatFromMime = attachment.mimeType
								.toLowerCase()
								.split("/")
								[1]?.split(";")[0]
								?.trim();
							contentParts.push({
								type: "input_audio",
								input_audio: {
									data,
									format: formatFromMime || "wav",
								},
							});
						} else {
							contentParts.push({
								type: "input_file",
								filename: attachment.name,
								file_data: attachment.dataUrl,
							});
						}
					}
					return {
						role: message.role,
						content: contentParts,
					};
				});
			const requestBody: Record<string, unknown> = {
				model: effectiveModelId,
			};
			if (endpoint === "responses") {
				requestBody.input = input;
				requestBody.stream = streamEnabled;
				if (wantsImageModalities) {
					requestBody.modalities = ["text", "image"];
				}
				if (
					isUnified &&
					(sendPayload?.webSearchEnabled ??
						thread.settings.webSearchEnabled)
				) {
					requestBody.tools = [{ type: "web_search_preview" }];
				}
			} else if (endpoint === "images.generations") {
				requestBody.prompt = latestUserPrompt || "Generate an image.";
			} else if (endpoint === "video.generation") {
				requestBody.prompt =
					latestUserPrompt || "Generate a short cinematic video.";
				const firstImage = preparedAttachments.find(
					(attachment) => attachment.isImage,
				);
				if (firstImage) {
					requestBody.image = firstImage.dataUrl;
				}
			} else if (endpoint === "music.generate") {
				requestBody.prompt =
					latestUserPrompt || "Generate a short ambient music loop.";
			} else if (endpoint === "audio.speech") {
				requestBody.input =
					latestUserPrompt || "Hello from AI Stats unified chat.";
				requestBody.voice = "alloy";
				requestBody.format = "mp3";
			}

			if (
				thread.settings.providerId &&
				thread.settings.providerId !== "auto"
			) {
				requestBody.provider = {
					only: [thread.settings.providerId],
				};
			}
			if (endpoint === "responses" && thread.settings.reasoningEnabled) {
				requestBody.reasoning = {
					effort: thread.settings.reasoningEffort ?? "medium",
					summary: "auto",
				};
			}

			setError(null);
			if (manageSendingState) {
				setIsSending(true);
			}

			const requestStartedAt = performance.now();
			let firstTokenAt: number | null = null;
			let finalUsage: Record<string, unknown> | null = null;
			let finalMeta: Record<string, unknown> | null = null;
			let latestThread = thread;
			const assistantId = targetAssistantId ?? generateId();
			let streamingMessageId = assistantId;
			let variantIndex = 0;
			let assistantContent = "";
			let placeholderReady = false;

			if (!streamEnabled) {
				if (targetAssistantId) {
					const initialVariant = {
						id: generateId(),
						content: "Generating...",
						createdAt: nowIso(),
						meta: compareMeta ?? undefined,
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
					const orgId = getOrgId(effectiveModelId);
					const createdAt = nowIso();
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "Generating...",
						createdAt,
						modelId: effectiveModelId,
						providerId: thread.settings.providerId,
						providerName:
							orgNameById[orgId] ?? formatOrgLabel(orgId),
						variants: [
							{
								id: assistantId,
								content: "Generating...",
								createdAt,
								meta: compareMeta ?? undefined,
							},
						],
						activeVariantIndex: 0,
						meta: compareMeta ?? undefined,
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
				...(compareMeta ?? {}),
				...(finalMeta ?? {}),
				client: clientMeta,
			});

			try {
				const useUnifiedRoute = isUnified || endpoint !== "responses";
				const response = await fetch(
					useUnifiedRoute
						? "/api/chat/unified"
						: "/api/chat/playground",
					{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						baseUrl: base,
						apiKey: apiKey.trim(),
						...(useUnifiedRoute ? { endpoint } : {}),
						requestBody,
						appHeaders: APP_HEADERS,
						debug: shouldDebug,
					}),
					},
				);
				// eslint-disable-next-line no-console
				console.log(
					"[chat] response",
					response.status,
					response.statusText,
				);

				if (!response.ok) {
					const contentType =
						response.headers.get("content-type") ?? "";
					let errorMessage = `Request failed (${response.status}).`;
					let errorCode: string | undefined;
					if (contentType.includes("application/json")) {
						try {
							const payload = (await response.json()) as
								| Record<string, unknown>
								| null;
							if (payload) {
								if (typeof payload.message === "string") {
									errorMessage = payload.message;
								} else if (
									typeof payload.error === "string"
								) {
									errorMessage = payload.error;
								}
								if (typeof payload.error === "string") {
									errorCode = payload.error;
								}
							}
						} catch {
							// ignore malformed JSON payloads
						}
					} else {
						const text = await response.text();
						if (text) errorMessage = text;
					}
					const requestError = new Error(errorMessage) as Error & {
						code?: string;
					};
					if (errorCode) requestError.code = errorCode;
					throw requestError;
				}

				if (!streamEnabled || !response.body) {
					const contentType = response.headers.get("content-type") ?? "";
					let data: any = null;
					if (contentType.includes("application/json")) {
						data = await response.json();
					} else if (contentType.startsWith("text/")) {
						const textPayload = await response.text();
						data = { output_text: textPayload };
					} else {
						const blob = await response.blob();
						const objectUrl = URL.createObjectURL(blob);
						assistantContent = `[${getEndpointResultLabel(endpoint)}](${objectUrl})`;
					}

					if (data) {
						const reply = extractResponseText(data);
						const images = extractResponseImages(data);
						const mediaUrl = extractUnifiedMediaUrl(data);
						const status = normalizeGenerationStatus(data);
						const resourceId = extractGenerationResourceId(data);
						finalUsage =
							data?.usage ??
							data?.response?.usage ??
							data?.response?.output?.usage ??
							null;
						finalMeta = data?.meta ?? data?.response?.meta ?? null;
						const clientMeta = buildClientMeta(performance.now());
						const mergedMeta = mergeMeta(clientMeta);
						const reasoningText =
							endpoint === "responses"
								? extractReasoningText(data)
								: "";
						if (reasoningText) {
							mergedMeta.reasoning_text = reasoningText;
						}
						const totalCostUsd = extractTotalCostUsd(finalUsage);
						if (totalCostUsd) {
							mergedMeta.total_cost_usd = totalCostUsd;
						}
						assistantContent = appendImagesToText(reply, images);
						if (mediaUrl) {
							const mediaLabel = getEndpointResultLabel(endpoint);
							assistantContent = [assistantContent, `[${mediaLabel}](${mediaUrl})`]
								.filter(Boolean)
								.join("\n\n");
						}
						if (!assistantContent) {
							assistantContent =
								status && PENDING_STATUSES.has(status)
									? "Generating..."
									: "Request completed.";
						}
						if (
							endpoint === "video.generation" &&
							resourceId &&
							status &&
							PENDING_STATUSES.has(status)
						) {
							for (let attempt = 1; attempt <= 80; attempt += 1) {
								await wait(2500);
								const pollResponse = await fetch("/api/chat/unified", {
									method: "POST",
									headers: {
										"Content-Type": "application/json",
									},
									body: JSON.stringify({
										baseUrl: base,
										apiKey: apiKey.trim(),
										endpoint,
										poll: { resourceId },
										appHeaders: APP_HEADERS,
										debug: shouldDebug,
									}),
								});
								if (!pollResponse.ok) continue;
								const pollType =
									pollResponse.headers.get("content-type") ?? "";
								if (!pollType.includes("application/json")) {
									const pollBlob = await pollResponse.blob();
									const pollUrl = URL.createObjectURL(pollBlob);
									assistantContent = `[${getEndpointResultLabel(endpoint)}](${pollUrl})`;
									break;
								}
								const pollData = await pollResponse.json();
								const pollUrl = extractUnifiedMediaUrl(pollData);
								const pollStatus = normalizeGenerationStatus(pollData);
								if (pollUrl) {
									assistantContent = `[${getEndpointResultLabel(endpoint)}](${pollUrl})`;
									break;
								}
								if (pollStatus && COMPLETED_STATUSES.has(pollStatus)) {
									assistantContent = "Video generation completed.";
									break;
								}
								assistantContent = `Generating... (${attempt})`;
								latestThread = updateAssistantVariant(
									latestThread,
									assistantId,
									variantIndex,
									assistantContent,
									finalUsage,
									mergedMeta,
								);
								await updateThreadState(latestThread, false);
							}
						}
						if (shouldDebug) {
							// eslint-disable-next-line no-console
							console.log("[chat] non-stream final usage/meta", {
								usage: finalUsage,
								meta: mergedMeta,
								endpoint,
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
					if (shouldDebug) {
						// eslint-disable-next-line no-console
						console.log("[chat] non-stream final usage/meta", {
							usage: finalUsage,
							meta: finalMeta,
						});
					}
					if (placeholderReady) {
						latestThread = updateAssistantVariant(
							latestThread,
							assistantId,
							variantIndex,
							assistantContent,
							finalUsage,
							mergeMeta(buildClientMeta(performance.now())),
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
						meta: compareMeta ?? undefined,
					};
					const result = appendAssistantVariant(
						latestThread,
						targetAssistantId,
						initialVariant,
					);
					latestThread = result.nextThread;
					variantIndex = result.variantIndex;
					streamingMessageId = targetAssistantId;
					await updateThreadState(latestThread, false);
				} else {
					const orgId = getOrgId(effectiveModelId);
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "",
						createdAt: nowIso(),
						modelId: effectiveModelId,
						providerId: thread.settings.providerId,
						providerName:
							orgNameById[orgId] ?? formatOrgLabel(orgId),
						variants: [
							{
								id: assistantId,
								content: "",
								createdAt: nowIso(),
								meta: compareMeta ?? undefined,
							},
						],
						activeVariantIndex: 0,
						meta: compareMeta ?? undefined,
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
						let frameEventType = "";
						const frameDataLines: string[] = [];
						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed) continue;
							if (trimmed.startsWith("event:")) {
								frameEventType = trimmed.slice(6).trim();
								continue;
							}
							if (trimmed.startsWith("data:")) {
								frameDataLines.push(trimmed.slice(5).trimStart());
							}
						}
						const data = frameDataLines.join("").trim();
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
								const frameType = parsed?.type ?? frameEventType;
								if (
									frameType === "response.output_text.delta"
								) {
									if (typeof parsed?.delta === "string") {
										delta = parsed.delta;
									}
								} else if (
									frameType === "response.reasoning.delta" ||
									frameType === "response.reasoning_text.delta"
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
									const images = extractResponseImages(
										parsed?.response ?? parsed,
									);
									if (images.length > 0) {
										assistantContent = appendImagesToText(
											responseText || assistantContent,
											images,
										);
										responseText = assistantContent;
									}
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
												...(compareMeta ?? {}),
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
										...(compareMeta ?? {}),
										...(finalMeta ?? {}),
										reasoning_text: reasoningContent,
									});
								} else if (reasoningUpdated) {
									scheduleUpdate({
										...(compareMeta ?? {}),
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
												...(compareMeta ?? {}),
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
				const errorCode =
					typeof (err as { code?: unknown })?.code === "string"
						? (err as { code: string }).code
						: "";
				const isGatewayUnavailable =
					errorCode === "gateway_unreachable";
				setError(message);
				const isGatewayError =
					message.includes('"description":"all_candidates_failed"') ||
					message.includes('"errorCode":"upstream_error"') ||
					message.includes("all_candidates_failed");
				const errorContent = isGatewayError
					? "All Providers Failed"
					: isGatewayUnavailable
						? message
						: "Internal Server Error";
				if (latestThread) {
					const existingMessage = latestThread.messages.find(
						(m) => m.id === streamingMessageId
					);
					if (existingMessage) {
						latestThread = updateAssistantVariant(
							latestThread,
							streamingMessageId,
							variantIndex,
							errorContent,
							undefined,
							compareMeta ?? undefined,
						);
					} else {
						const orgId = getOrgId(effectiveModelId);
						const errorMessage: ChatMessage = {
							id: generateId(),
							role: "assistant",
							content: errorContent,
							createdAt: nowIso(),
							modelId: effectiveModelId,
							providerId: latestThread.settings.providerId,
							providerName:
								orgNameById[orgId] ?? formatOrgLabel(orgId),
							variants: [
								{
									id: generateId(),
									content: errorContent,
									createdAt: nowIso(),
									meta: compareMeta ?? undefined,
								},
							],
							activeVariantIndex: 0,
							meta: compareMeta ?? undefined,
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
				if (manageSendingState) {
					setIsSending(false);
				}
			}
		},
		[
			apiKey,
			baseUrl,
			isUnified,
			personalization,
			shouldDebug,
			appendAssistantVariant,
			getPrimaryCapabilityForModel,
			orgNameById,
			temporaryMode,
			updateAssistantVariant,
			updateThreadState,
		],
	);

	const buildThreadForModel = useCallback(
		(thread: ChatThread, modelId: string): ChatThread => {
			const effective = getEffectiveModelSettings(thread, modelId);
			return {
				...thread,
				settings: {
					...thread.settings,
					...effective,
				},
			};
		},
		[],
	);

	const handleSend = useCallback(
		async (payload: ChatSendPayload) => {
			if (!activeThread || isSending) return;
			const content = buildUserMessageContent(payload);
			if (!content.trim() && payload.attachments.length === 0) return;
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
			let inlineAttachmentPreviews: Awaited<
				ReturnType<typeof prepareInlineAttachmentPreviews>
			> = [];
			if (payload.attachments.length) {
				try {
					inlineAttachmentPreviews = await prepareInlineAttachmentPreviews(
						payload.attachments,
					);
				} catch {
					inlineAttachmentPreviews = [];
				}
			}

			const userMessage: ChatMessage = {
				id: generateId(),
				role: "user",
				content,
				createdAt: nowIso(),
				meta: inlineAttachmentPreviews.length
					? {
							attachment_previews: inlineAttachmentPreviews,
						}
					: undefined,
			};

			const nextTitle = activeThread.titleLocked
				? activeThread.title
				: buildTitle([...(activeThread.messages ?? []), userMessage]);

			let updatedThread: ChatThread = {
				...activeThread,
				title: nextTitle,
				messages: [...activeThread.messages, userMessage],
				updatedAt: nowIso(),
			};
			const normalizedOverrides = ensureModelOverridesForIds(
				updatedThread.settings,
				[
					updatedThread.modelId,
					...(updatedThread.settings.compareModelIds ?? []),
				],
			);
			if (normalizedOverrides !== updatedThread.settings.modelOverridesById) {
				updatedThread = {
					...updatedThread,
					settings: {
						...updatedThread.settings,
						modelOverridesById: normalizedOverrides,
					},
				};
			}

			await updateThreadState(updatedThread, !temporaryMode);
			const inferredEndpoint = isUnified
				? inferUnifiedEndpoint({
						modelId: updatedThread.modelId,
						defaultCapability:
							getPrimaryCapabilityForModel(updatedThread.modelId),
					})
				: "responses";
			if (
				isUnified &&
				!isModelCapabilityCompatible(
					updatedThread.modelId,
					inferredEndpoint,
				)
			) {
				setError(
					"The selected model does not support this output modality. Pick a model that supports this endpoint.",
				);
				setModelPickerOpen(true);
				return;
			}
			const hasAudioAttachment = payload.attachments.some((file) =>
				file.type.startsWith("audio/"),
			);
			if (
				hasAudioAttachment &&
				!supportsModelAudioInput(updatedThread.modelId)
			) {
				setError(
					"The selected model does not support audio input. Choose an audio-input compatible model.",
				);
				setModelPickerOpen(true);
				return;
			}
			const candidateModelIds =
				isUnified && inferredEndpoint === "responses"
					? Array.from(
							new Set([
								updatedThread.modelId,
								...(updatedThread.settings.compareModelIds ?? []),
							]),
						).filter(Boolean)
					: [updatedThread.modelId].filter(Boolean);
			const enabledModelIds = candidateModelIds.filter((modelId) => {
				const modelSettings = getEffectiveModelSettings(
					updatedThread,
					modelId,
				);
				if (modelSettings.enabled === false) return false;
				if (
					isUnified &&
					!isModelCapabilityCompatible(modelId, inferredEndpoint)
				) {
					return false;
				}
				if (
					hasAudioAttachment &&
					!supportsModelAudioInput(modelId)
				) {
					return false;
				}
				return true;
			});
			if (enabledModelIds.length === 0) {
				setError(
					hasAudioAttachment
						? "No selected models can accept audio input. Select at least one audio-input compatible model."
						: "No selected models match the current output modality or they are all turned off.",
				);
				setModelSettingsTargetModelId(updatedThread.modelId);
				setModelSettingsOpen(true);
				return;
			}
			if (enabledModelIds.length === 1) {
				await executeCompletion(
					buildThreadForModel(updatedThread, enabledModelIds[0]),
					updatedThread.messages,
					undefined,
					payload,
					undefined,
					enabledModelIds[0],
				);
				return;
			}
			const compareGroupId = generateId();
			setIsSending(true);
			try {
				await Promise.all(
					enabledModelIds.map((modelId) =>
						executeCompletion(
							buildThreadForModel(updatedThread, modelId),
							updatedThread.messages,
							undefined,
							payload,
							compareGroupId,
							modelId,
							false,
						),
					),
				);
			} finally {
				setIsSending(false);
			}
		},
		[
			activeThread,
			apiKey,
			buildThreadForModel,
			executeCompletion,
			getPrimaryCapabilityForModel,
			isModelCapabilityCompatible,
			isUnified,
			isSending,
			isAuthenticated,
			supportsModelAudioInput,
			temporaryMode,
			updateThreadState,
		],
	);

	const handleEditMessage = useCallback(
		async (messageId: string, content: string) => {
			if (!activeThread || isSending) return;
			const nextContent = content.trim();
			if (!nextContent) return;
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
			const originalMessage = activeThread.messages[messageIndex];
			if (!originalMessage || originalMessage.role !== "user") return;

			const editedThread = applyMessageUpdate(
				activeThread,
				messageId,
				(message) => {
					const variants = [
						...ensureVariants(message),
						{
							id: generateId(),
							content: nextContent,
							createdAt: nowIso(),
							usage: null,
							meta: message.meta ?? null,
						},
					];
					const activeVariantIndex = variants.length - 1;
					return {
						...message,
						content: nextContent,
						variants,
						activeVariantIndex,
					};
				},
			);

			const nextTitle = editedThread.titleLocked
				? editedThread.title
				: buildTitle(editedThread.messages);
			const updatedThread = {
				...editedThread,
				title: nextTitle,
				updatedAt: nowIso(),
			};

			await updateThreadState(updatedThread, !temporaryMode);

			const nextUserMessageIndex = updatedThread.messages.findIndex(
				(message, index) => index > messageIndex && message.role === "user",
			);
			const assistantRangeEnd =
				nextUserMessageIndex === -1
					? updatedThread.messages.length
					: nextUserMessageIndex;
			const targetAssistants = updatedThread.messages.slice(
				messageIndex + 1,
				assistantRangeEnd,
			).filter((message) => message.role === "assistant");
			const contextMessages = updatedThread.messages.slice(0, messageIndex + 1);

			setIsSending(true);
			try {
				if (targetAssistants.length === 0) {
					const targetModelId = updatedThread.modelId;
					await executeCompletion(
						buildThreadForModel(updatedThread, targetModelId),
						contextMessages,
						undefined,
						undefined,
						undefined,
						targetModelId,
						false,
					);
					return;
				}

				await Promise.all(
					targetAssistants.map((assistantMessage) => {
						const targetModelId =
							assistantMessage.modelId ?? updatedThread.modelId;
						return executeCompletion(
							buildThreadForModel(updatedThread, targetModelId),
							contextMessages,
							assistantMessage.id,
							undefined,
							undefined,
							targetModelId,
							false,
						);
					}),
				);
			} finally {
				setIsSending(false);
			}
		},
		[
			activeThread,
			apiKey,
			applyMessageUpdate,
			buildThreadForModel,
			executeCompletion,
			isAuthenticated,
			isSending,
			temporaryMode,
			updateThreadState,
		],
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
			const targetModelId =
				activeThread.messages[messageIndex]?.modelId ??
				activeThread.modelId;
			const targetSettings = getEffectiveModelSettings(
				activeThread,
				targetModelId,
			);
			if (targetSettings.enabled === false) {
				setError(
					"This model is turned off for the current chat. Enable it in per-model settings.",
				);
				setModelSettingsTargetModelId(targetModelId);
				setModelSettingsOpen(true);
				return;
			}
			await executeCompletion(
				buildThreadForModel(activeThread, targetModelId),
				contextMessages,
				messageId,
				undefined,
				undefined,
				targetModelId,
			);
		},
		[
			activeThread,
			apiKey,
			buildThreadForModel,
			executeCompletion,
			isAuthenticated,
			isSending,
		],
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
		[
			activeThread,
			getPrimaryCapabilityForModel,
			isModelCapabilityCompatible,
			temporaryMode,
			updateThreadState,
		],
	);

	const updateActiveModel = useCallback(
		(modelId: string) => {
			if (!activeThread) return;
			const requiredCapability = getPrimaryCapabilityForModel(modelId);
			const currentModelDisplayName =
				activeThread.settings.modelOverridesById?.[
					activeThread.modelId
				]?.displayName ?? "";
			const nextModelDisplayName =
				activeThread.settings.modelOverridesById?.[modelId]
					?.displayName ?? "";
			const previousDefault = buildDefaultSystemPrompt(
				activeThread.modelId,
				currentModelDisplayName,
			);
			const nextCompareModelIds = Array.from(
				new Set(
					(activeThread.settings.compareModelIds ?? []).filter(
						(id) =>
							id &&
							id !== modelId &&
							isModelSelectableForContext(
								id,
								requiredCapability,
								composerRequiresAudioInput,
							),
					),
				),
			);
			const nextSystemPrompt =
				!activeThread.settings.systemPrompt ||
				activeThread.settings.systemPrompt === previousDefault
					? buildDefaultSystemPrompt(modelId, nextModelDisplayName)
					: activeThread.settings.systemPrompt;
			const nextModelOverrides = ensureModelOverridesForIds(
				activeThread.settings,
				[modelId, ...nextCompareModelIds],
			);
			const nextThread = {
				...activeThread,
				modelId,
				settings: {
					...activeThread.settings,
					systemPrompt: nextSystemPrompt,
					compareModelIds: nextCompareModelIds,
					compareMode: nextCompareModelIds.length > 0,
					modelOverridesById: nextModelOverrides,
				},
				updatedAt: nowIso(),
			};
			setLastModelId(modelId);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEYS.lastModelId, modelId);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			getPrimaryCapabilityForModel,
			isModelSelectableForContext,
			composerRequiresAudioInput,
			temporaryMode,
			updateThreadState,
		],
	);

	const removeSelectedModel = useCallback(
		(modelId: string) => {
			if (!activeThread) return;
			const compare = activeThread.settings.compareModelIds ?? [];
			if (modelId !== activeThread.modelId) {
				const nextCompare = compare.filter((id) => id !== modelId);
				updateActiveSettings({
					compareModelIds: nextCompare,
					compareMode: nextCompare.length > 0,
				});
				return;
			}
			if (compare.length === 0) {
				const nextThread: ChatThread = {
					...activeThread,
					modelId: "",
					settings: {
						...activeThread.settings,
						compareModelIds: [],
						compareMode: false,
					},
					updatedAt: nowIso(),
				};
				updateThreadState(nextThread, !temporaryMode);
				return;
			}
			const [nextPrimary, ...restCompare] = compare;
			if (!nextPrimary) return;
			const nextThread: ChatThread = {
				...activeThread,
				modelId: nextPrimary,
				settings: {
					...activeThread.settings,
					compareModelIds: restCompare,
					compareMode: restCompare.length > 0,
				},
				updatedAt: nowIso(),
			};
			setLastModelId(nextPrimary);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					STORAGE_KEYS.lastModelId,
					nextPrimary,
				);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[activeThread, temporaryMode, updateActiveSettings, updateThreadState],
	);
	const removeAllSelectedModels = useCallback(() => {
		if (!activeThread) return;
		const nextThread: ChatThread = {
			...activeThread,
			modelId: "",
			settings: {
				...activeThread.settings,
				compareModelIds: [],
				compareMode: false,
			},
			updatedAt: nowIso(),
		};
		updateThreadState(nextThread, !temporaryMode);
	}, [activeThread, temporaryMode, updateThreadState]);

	const updateCompareModelIds = useCallback(
		(ids: string[]) => {
			if (!activeThread) return;
			const requiredCapability = getPrimaryCapabilityForModel(
				activeThread.modelId,
			);
			const nextCompareModelIds = Array.from(
				new Set(
					ids.filter(
						(id) =>
							id &&
							id !== activeThread.modelId &&
							isModelSelectableForContext(
								id,
								requiredCapability,
								composerRequiresAudioInput,
							),
					),
				),
			);
			const nextModelOverrides = ensureModelOverridesForIds(
				activeThread.settings,
				[activeThread.modelId, ...nextCompareModelIds],
			);
			const nextThread: ChatThread = {
				...activeThread,
				settings: {
					...activeThread.settings,
					compareModelIds: nextCompareModelIds,
					compareMode: nextCompareModelIds.length > 0,
					modelOverridesById: nextModelOverrides,
				},
				updatedAt: nowIso(),
			};
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			composerRequiresAudioInput,
			isModelSelectableForContext,
			temporaryMode,
			updateThreadState,
		],
	);

	const openModelSettingsForModel = useCallback(
		(modelId?: string | null) => {
			const targetModelId = modelId ?? activeThread?.modelId ?? null;
			if (!targetModelId) return;
			setModelSettingsTargetModelId(targetModelId);
			setModelSettingsOpen(true);
		},
		[activeThread?.modelId],
	);

	useEffect(() => {
		if (!queryModelIsValid || !queryModelId || !activeThread) return;
		if (activeThread.modelId === queryModelId) return;
		updateActiveModel(queryModelId);
	}, [activeThread, queryModelId, queryModelIsValid, updateActiveModel]);
	useEffect(() => {
		if (!isUnified || !activeThread?.modelId) return;
		const compareIds = activeThread.settings.compareModelIds ?? [];
		if (!compareIds.length) return;
		const requiredCapability = getPrimaryCapabilityForModel(
			activeThread.modelId,
		);
		const normalizedCompareIds = compareIds.filter(
			(id) =>
				id &&
				id !== activeThread.modelId &&
				isModelSelectableForContext(
					id,
					requiredCapability,
					composerRequiresAudioInput,
				),
		);
		const unchanged =
			normalizedCompareIds.length === compareIds.length &&
			normalizedCompareIds.every((id, index) => id === compareIds[index]);
		if (unchanged) return;
		const nextThread: ChatThread = {
			...activeThread,
			settings: {
				...activeThread.settings,
				compareModelIds: normalizedCompareIds,
				compareMode: normalizedCompareIds.length > 0,
			},
			updatedAt: nowIso(),
		};
		void updateThreadState(nextThread, !temporaryMode);
	}, [
		activeThread,
		composerRequiresAudioInput,
		getPrimaryCapabilityForModel,
		isModelSelectableForContext,
		isUnified,
		temporaryMode,
		updateThreadState,
	]);
	useEffect(() => {
		if (!composerRequiresAudioInput || !activeThread?.modelId) {
			return;
		}
		if (supportsModelAudioInput(activeThread.modelId)) {
			return;
		}
		setError(
			"Audio is attached. Select a model that supports audio input to continue.",
		);
		setModelPickerOpen(true);
	}, [
		activeThread?.modelId,
		composerRequiresAudioInput,
		isUnified,
		supportsModelAudioInput,
	]);

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
	const selectedModelIds = useMemo(() => {
		const ids: string[] = [];
		if (activeThread?.modelId) {
			ids.push(activeThread.modelId);
		}
		for (const id of activeThread?.settings.compareModelIds ?? []) {
			if (!id || id === activeThread?.modelId) continue;
			ids.push(id);
		}
		return Array.from(new Set(ids));
	}, [activeThread?.modelId, activeThread?.settings.compareModelIds]);
	const selectedModelDisplayNameById = useMemo(() => {
		const labels: Record<string, string> = {};
		for (const modelId of selectedModelIds) {
			const model = models.find((entry) => entry.modelId === modelId);
			const defaultLabel = model?.modelName ?? formatModelLabel(modelId);
			const overrideLabel =
				activeThread?.settings.modelOverridesById?.[modelId]?.displayName?.trim();
			labels[modelId] = overrideLabel || defaultLabel;
		}
		return labels;
	}, [activeThread?.settings.modelOverridesById, models, selectedModelIds]);
	const selectedModelEnabledById = useMemo(() => {
		const enabledById: Record<string, boolean> = {};
		for (const modelId of selectedModelIds) {
			enabledById[modelId] =
				activeThread?.settings.modelOverridesById?.[modelId]?.enabled !==
				false;
		}
		return enabledById;
	}, [activeThread?.settings.modelOverridesById, selectedModelIds]);
	const modelSettingsChoices = useMemo(
		() => {
			const requiredCapability = isUnified ? activeModelCapability : null;
			const requiresAudioInput = composerRequiresAudioInput;
			const byId = new Map<
				string,
				{ id: string; label: string; orgId: string; orgName: string }
			>();
			for (const model of selectableModels) {
				const modelCapabilities = getModelCapabilities(model.modelId);
				if (
					requiredCapability &&
					!modelCapabilities.includes(requiredCapability)
				) {
					continue;
				}
				if (requiresAudioInput && !supportsModelAudioInput(model.modelId)) {
					continue;
				}
				if (byId.has(model.modelId)) continue;
				const orgId = getOrgId(model.modelId);
				const orgName =
					model.organisationName ??
					model.providerName ??
					formatOrgLabel(orgId);
				// Keep selector labels canonical; nicknames are display-only in chat UI.
				const baseLabel = model.modelName || formatModelLabel(model.modelId);
				const isDisabled =
					activeThread?.settings.modelOverridesById?.[
						model.modelId
					]?.enabled === false;
				byId.set(model.modelId, {
					id: model.modelId,
					label: isDisabled ? `${baseLabel} (Off)` : baseLabel,
					orgId,
					orgName,
				});
			}
			return Array.from(byId.values()).sort(
				(a, b) =>
					a.orgName.localeCompare(b.orgName) ||
					a.label.localeCompare(b.label),
			);
		},
		[
			activeModelCapability,
			activeThread?.settings.modelOverridesById,
			composerRequiresAudioInput,
			getModelCapabilities,
			isUnified,
			selectableModels,
			supportsModelAudioInput,
		],
	);
	const selectedModelLabel = useMemo(() => {
		if (!activeThread?.modelId) return "Select model";
		return (
			selectedModelDisplayNameById[activeThread.modelId] ??
			formatModelLabel(activeThread.modelId)
		);
	}, [activeThread?.modelId, selectedModelDisplayNameById]);
	const selectedModelsHint = useMemo(() => {
		if (selectedModelIds.length <= 1) {
			const activeModelId = activeThread?.modelId;
			if (!activeModelId) return "Select model";
			const activeLabel =
				selectedModelDisplayNameById[activeModelId] ?? activeModelId;
			return selectedModelEnabledById[activeModelId] === false
				? `${activeLabel} (Off)`
				: activeLabel;
		}
		const preview = selectedModelIds
			.slice(0, 5)
			.map((modelId) => {
				const label = selectedModelDisplayNameById[modelId] ?? modelId;
				return selectedModelEnabledById[modelId] === false
					? `${label} (Off)`
					: label;
			});
		const overflow = Math.max(0, selectedModelIds.length - preview.length);
		const label = preview.join(", ");
		return overflow > 0 ? `${label} +${overflow}` : label;
	}, [
		activeThread?.modelId,
		selectedModelDisplayNameById,
		selectedModelEnabledById,
		selectedModelIds,
	]);
	const modelSettingsModelId =
		modelSettingsTargetModelId ?? activeThread?.modelId ?? null;
	const activeModelSettings = useMemo(() => {
		if (!activeThread || !modelSettingsModelId) return null;
		return getEffectiveModelSettings(activeThread, modelSettingsModelId);
	}, [activeThread, modelSettingsModelId]);
	const dialogModelSettings: ChatModelSettings = useMemo(() => {
		if (activeModelSettings) return activeModelSettings;
		const fallbackModelId = modelSettingsModelId ?? activeThread?.modelId ?? "";
		const fallbackDisplayName =
			activeThread?.settings.modelOverridesById?.[fallbackModelId]
				?.displayName ?? "";
		return {
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
			systemPrompt: buildDefaultSystemPrompt(
				fallbackModelId,
				fallbackDisplayName,
			),
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
	}, [
		activeModelSettings,
		activeThread?.modelId,
		activeThread?.settings.modelOverridesById,
		modelSettingsModelId,
	]);
	const temperatureValue = activeModelSettings?.temperature ?? 0.7;
	const maxTokensValue = activeModelSettings?.maxOutputTokens ?? 800;
	const topPValue = activeModelSettings?.topP ?? 1;
	const topKValue = activeModelSettings?.topK ?? 40;
	const minPValue = activeModelSettings?.minP ?? 0;
	const topAValue = activeModelSettings?.topA ?? 0;
	const frequencyValue = activeModelSettings?.frequencyPenalty ?? 0;
	const presenceValue = activeModelSettings?.presencePenalty ?? 0;
	const repetitionValue = activeModelSettings?.repetitionPenalty ?? 1;

	const updateModelSettings = useCallback(
		(partial: Partial<ChatModelSettings>) => {
			if (!activeThread || !modelSettingsModelId) return;
			const currentOverrides = activeThread.settings.modelOverridesById ?? {};
			const existingModelOverrides = currentOverrides[modelSettingsModelId] ?? {};
			const nextPartial = { ...partial };
			if (typeof partial.displayName === "string" && partial.systemPrompt === undefined) {
				const previousDisplayName =
					typeof existingModelOverrides.displayName === "string"
						? existingModelOverrides.displayName
						: "";
				const nextDisplayName = partial.displayName;
				const previousDefaultPrompt = buildDefaultSystemPrompt(
					modelSettingsModelId,
					previousDisplayName,
				);
				const nextDefaultPrompt = buildDefaultSystemPrompt(
					modelSettingsModelId,
					nextDisplayName,
				);
				const currentEffectiveSystemPrompt = getEffectiveModelSettings(
					activeThread,
					modelSettingsModelId,
				).systemPrompt;
				const hasExplicitModelPrompt =
					existingModelOverrides.systemPrompt !== undefined;
				const isStillOnDefaultTemplate =
					(currentEffectiveSystemPrompt ?? "").trim() ===
					previousDefaultPrompt.trim();
				if (!hasExplicitModelPrompt || isStillOnDefaultTemplate) {
					nextPartial.systemPrompt = nextDefaultPrompt;
				}
			}
			const nextModelOverrides = {
				...existingModelOverrides,
				...nextPartial,
			};
			const nextThread: ChatThread = {
				...activeThread,
				settings: {
					...activeThread.settings,
					modelOverridesById: {
						...currentOverrides,
						[modelSettingsModelId]: nextModelOverrides,
					},
				},
				updatedAt: nowIso(),
			};
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			modelSettingsModelId,
			temporaryMode,
			updateThreadState,
		],
	);

	const updateModelSettingNumber = useCallback(
		(key: keyof ChatModelSettings, value: number | null) => {
			updateModelSettings({ [key]: value } as Partial<ChatModelSettings>);
		},
		[updateModelSettings],
	);
	const applyModelSettingsToAll = useCallback(() => {
		if (!activeThread || !modelSettingsModelId) return;
		const selectedIds = Array.from(
			new Set([
				activeThread.modelId,
				...(activeThread.settings.compareModelIds ?? []),
			]),
		).filter(Boolean);
		if (selectedIds.length < 2) return;
		const sourceSettings = getEffectiveModelSettings(
			activeThread,
			modelSettingsModelId,
		);
		const { providerId: _ignoredProviderId, ...sharedSettings } =
			sourceSettings;
		const currentOverrides = activeThread.settings.modelOverridesById ?? {};
		const nextOverrides = { ...currentOverrides };
		for (const modelId of selectedIds) {
			nextOverrides[modelId] = {
				...(currentOverrides[modelId] ?? {}),
				...sharedSettings,
			};
		}
		const nextThread: ChatThread = {
			...activeThread,
			settings: {
				...activeThread.settings,
				modelOverridesById: nextOverrides,
			},
			updatedAt: nowIso(),
		};
		updateThreadState(nextThread, !temporaryMode);
	}, [
		activeThread,
		modelSettingsModelId,
		temporaryMode,
		updateThreadState,
	]);
	const handleModelSettingsModelChange = useCallback(
		(modelId: string) => {
			setModelSettingsTargetModelId(modelId);
			updateActiveModel(modelId);
		},
		[updateActiveModel],
	);
	const resetModelSettings = useCallback(() => {
		if (!activeThread || !modelSettingsModelId) return;
		const currentOverrides = activeThread.settings.modelOverridesById ?? {};
		if (!(modelSettingsModelId in currentOverrides)) return;
		const nextOverrides = { ...currentOverrides };
		delete nextOverrides[modelSettingsModelId];
		const nextThread: ChatThread = {
			...activeThread,
			settings: {
				...activeThread.settings,
				modelOverridesById: nextOverrides,
			},
			updatedAt: nowIso(),
		};
		updateThreadState(nextThread, !temporaryMode);
	}, [
		activeThread,
		modelSettingsModelId,
		temporaryMode,
		updateThreadState,
	]);

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
					modelPickerOpen={modelPickerOpen}
					onModelPickerOpenChange={setModelPickerOpen}
					onUpdateModel={updateActiveModel}
					temporaryMode={temporaryMode}
					onToggleTemporaryMode={toggleTemporaryMode}
					onOpenModelSettings={() =>
						openModelSettingsForModel(activeThread?.modelId ?? null)
					}
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
					allowModelCompare={isUnified}
					compareModelIds={
						activeThread?.settings.compareModelIds ?? []
					}
					onCompareModelIdsChange={updateCompareModelIds}
					onRemoveModel={removeSelectedModel}
					onRemoveAllModels={removeAllSelectedModels}
					onOpenModelSettingsForModel={openModelSettingsForModel}
					modelDisplayNameById={selectedModelDisplayNameById}
					modelEnabledById={selectedModelEnabledById}
					modelCapabilitiesById={modelCapabilitiesById}
					modelSupportsAudioInputById={modelSupportsAudioInputById}
					requiredCapability={activeModelCapability}
					requireAudioInput={composerRequiresAudioInput}
				/>
				{isUnified ? (
					<div className="border-b border-border bg-amber-50/40 px-4 py-2 md:px-8 dark:bg-amber-950/20">
						<p className="text-xs text-muted-foreground">
							<span className="font-medium text-foreground">Beta:</span>{" "}
							The unified chat playground is in beta. Please report any issues on{" "}
							<Link
								href={CHAT_BETA_ISSUES_HREF}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
							>
								GitHub
							</Link>
							.
						</p>
					</div>
				) : (
					<div className="border-b border-border px-4 py-2 md:px-8">
						<p className="text-xs text-muted-foreground">
							Try the unified chat experience for multimodal endpoints and side-by-side model comparisons.{" "}
							<Link
								href="/chat/unified"
								className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
							>
								Open unified playground
							</Link>
							.
						</p>
					</div>
				)}
				<ChatConversation
					activeThread={activeThread}
					isSending={isSending}
					mode={mode}
					webSearchEnabled={
						activeThread?.settings.webSearchEnabled ?? false
					}
					onWebSearchEnabledChange={(enabled) =>
						updateActiveSettings({ webSearchEnabled: enabled })
					}
					reasoningEnabled={
						activeThread?.settings.reasoningEnabled ?? false
					}
					reasoningEffort={
						activeThread?.settings.reasoningEffort ?? "medium"
					}
					onReasoningEnabledChange={(enabled) =>
						updateActiveSettings({ reasoningEnabled: enabled })
					}
					onReasoningEffortChange={(effort) =>
						updateActiveSettings({ reasoningEffort: effort })
					}
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
					selectedModelId={activeThread?.modelId ?? ""}
					selectedModelLabel={selectedModelLabel}
					selectedModelCount={selectedModelIds.length}
					selectedModelsHint={selectedModelsHint}
					onOpenModelPicker={() => setModelPickerOpen(true)}
					onAudioAttachmentRequirementChange={(requiresAudioInput) =>
						setComposerRequiresAudioInput(requiresAudioInput)
					}
				/>
			</SidebarInset>
			<ModelSettingsDialog
				open={modelSettingsOpen}
				onOpenChange={(open) => {
					setModelSettingsOpen(open);
					if (!open) {
						setModelSettingsTargetModelId(null);
					}
				}}
				settings={dialogModelSettings}
				selectedModelId={modelSettingsModelId}
				modelChoices={modelSettingsChoices}
				onModelChange={handleModelSettingsModelChange}
				modelLabel={
					modelSettingsModelId
						? models.find((m) => m.modelId === modelSettingsModelId)
								?.modelName ??
						  formatModelLabel(modelSettingsModelId)
						: undefined
				}
				providerOptions={providerOptions}
				supportedProvidersForModel={
					modelSettingsModelId
						? models
								.filter((m) => m.modelId === modelSettingsModelId)
								.map((m) => m.providerId)
						: undefined
				}
				temperatureValue={temperatureValue}
				maxTokensValue={maxTokensValue}
				topPValue={topPValue}
				topKValue={topKValue}
				minPValue={minPValue}
				topAValue={topAValue}
				frequencyValue={frequencyValue}
				presenceValue={presenceValue}
				repetitionValue={repetitionValue}
				onUpdate={updateModelSettings}
				onUpdateNumber={updateModelSettingNumber}
				onReset={resetModelSettings}
				onApplyToAll={applyModelSettingsToAll}
				canApplyToAll={selectedModelIds.length > 1}
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
