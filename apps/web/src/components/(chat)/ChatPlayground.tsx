"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
} from "@/components/ui/sidebar";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type {
	ChatMessage,
	ChatModelSettings,
	ChatServerToolConfigs,
	ChatServerToolType,
	ChatSettings,
	ChatTag,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";
import {
	deleteChat,
	getAllChatTags,
	getAllChats,
	upsertChat,
	upsertChatTags,
} from "@/lib/indexeddb/chats";
import {
	ChatConversation,
	type ChatSendPayload,
} from "@/components/(chat)/ChatConversation";
import { ChatHeader } from "@/components/(chat)/ChatHeader";
import { ModelSettingsDialog } from "@/components/(chat)/ModelSettingsDialog";
import {
	type ChatRequestErrorDetails,
} from "@/components/(chat)/ChatRequestErrorNotice";
import { ChatSearchDialog } from "@/components/(chat)/ChatSearchDialog";
import { ChatRenameDialog } from "@/components/(chat)/ChatRenameDialog";
import { ChatDeleteDialog } from "@/components/(chat)/ChatDeleteDialog";
import { ChatNewChatDialog } from "@/components/(chat)/ChatNewChatDialog";
import { ChatTagsDialog } from "@/components/(chat)/ChatTagsDialog";
import {
	coerceResponseText,
	appendImagesToText,
	extractResponseImages,
	extractReasoningText,
	extractResponseToolCalls,
	extractResponseText,
	type ChatToolCall,
	type ChatTraceEvent,
} from "@/components/(chat)/chatPayload";
import {
	buildUserMessageContent,
	prepareAttachments,
	prepareInlineAttachmentPreviews,
} from "@/components/(chat)/playground/attachment-utils";
import {
	APP_HEADERS,
	DEFAULT_SETTINGS,
	DEFAULT_SERVER_TOOLS,
	STORAGE_KEYS,
	TEMP_CHAT_ID,
	buildServerToolDefinitions,
	buildDefaultSystemPrompt,
	buildPersonalizationPrompt,
	buildTitle,
	ensureModelOverridesForIds,
	ensureVariants,
	extractTotalCostUsd,
	formatModelLabel,
	formatOrgLabel,
	generateId,
	getChangedSettings,
	getEffectiveModelSettings,
	getOrgId,
	normalizeServerTools,
	normalizeBaseUrl,
	nowIso,
	shouldRequestImageModalities,
	type ChatResponseLayout,
	type PersonalizationSettings,
	type SettingChange,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	useChatModelCatalog,
} from "@/components/(chat)/playground/use-chat-model-catalog";
import { useChatAuth } from "@/components/(chat)/playground/use-chat-auth";
import { useGroupedChatThreads } from "@/components/(chat)/playground/use-grouped-chat-threads";
import {
	parseChatErrorResponse,
	type ChatErrorPayload,
} from "@/components/(chat)/playground/chat-request-errors";
import {
	linkChatPerformanceMessage,
	markChatPerformance,
} from "@/components/(chat)/playground/chat-performance";
import {
	ChatSidebar,
} from "@/components/(chat)/ChatSidebar";

type ChatPlaygroundProps = {
	models: GatewaySupportedModel[];
	modelParam?: string | null;
	promptParam?: string | null;
};

const DATETIME_TOOL_NAMES = new Set(["gateway_datetime", "gateway:datetime"]);

const getBrowserTimeZone = () => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
};

const appendTimezone = (timezones: string[], value: unknown) => {
	if (typeof value !== "string") return;
	const timezone = value.trim();
	if (timezone && !timezones.includes(timezone)) {
		timezones.push(timezone);
	}
};

const appendTimezoneList = (timezones: string[], value: unknown) => {
	if (!Array.isArray(value)) return;
	for (const item of value) {
		appendTimezone(timezones, item);
	}
};

const getDefaultDatetimeTimezones = () => {
	const timezones: string[] = [];
	appendTimezone(timezones, getBrowserTimeZone());
	appendTimezone(timezones, "UTC");
	return timezones.length ? timezones : ["UTC"];
};

const parseToolInput = (toolCall: ChatToolCall): Record<string, unknown> => {
	if (toolCall.input && typeof toolCall.input === "object" && !Array.isArray(toolCall.input)) {
		return toolCall.input as Record<string, unknown>;
	}
	if (toolCall.inputText) {
		try {
			const parsed = JSON.parse(toolCall.inputText);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return {};
		}
	}
	return {};
};

const isValidTimezone = (timezone: string) => {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
		return true;
	} catch {
		return false;
	}
};

const extractShortOffset = (offsetName: string) => {
	if (offsetName === "UTC" || offsetName === "GMT") {
		return "+00:00";
	}
	const match = offsetName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
	if (!match) {
		return "+00:00";
	}
	const sign = match[1];
	const hours = String(Number(match[2])).padStart(2, "0");
	const minutes = String(Number(match[3] ?? "0")).padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
};

const formatIsoInTimezone = (date: Date, timezone: string) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
		timeZoneName: "shortOffset",
	}).formatToParts(date);
	const partMap = new Map(parts.map((part) => [part.type, part.value]));
	const offsetName = partMap.get("timeZoneName") ?? "GMT";
	const offset = extractShortOffset(offsetName);
	return `${partMap.get("year") ?? "0000"}-${partMap.get("month") ?? "01"}-${partMap.get("day") ?? "01"}T${partMap.get("hour") ?? "00"}:${partMap.get("minute") ?? "00"}:${partMap.get("second") ?? "00"}.${String(date.getUTCMilliseconds()).padStart(3, "0")}${offset}`;
};

const buildClientDatetimeToolResults = (
	toolCalls: ChatToolCall[],
	defaultTimezones: string[],
) => {
	const results: Array<{ toolCallId: string; content: string }> = [];
	for (const toolCall of toolCalls) {
		if (!DATETIME_TOOL_NAMES.has(toolCall.name)) return null;
		const input = parseToolInput(toolCall);
		const timezones: string[] = [];
		appendTimezoneList(timezones, input.timezones);
		const resolvedTimezones = timezones.length
			? timezones
			: defaultTimezones.length
				? defaultTimezones
				: ["UTC"];
		const invalidTimezone = resolvedTimezones.find(
			(timezone) => !isValidTimezone(timezone),
		);
		if (invalidTimezone) {
			results.push({
				toolCallId: toolCall.id,
				content: JSON.stringify({
					error: "invalid_timezone",
					timezone: invalidTimezone,
					timezones: resolvedTimezones,
					message: "timezones must contain valid IANA timezone names",
				}),
			});
			continue;
		}
		const now = new Date();
		const datetimeResults = resolvedTimezones.map((timezone) => ({
			timezone,
			datetime: formatIsoInTimezone(now, timezone),
		}));
		results.push({
			toolCallId: toolCall.id,
			content: JSON.stringify({
				timezones: datetimeResults,
			}),
		});
	}
	return results.length ? results : null;
};

function compareChatTags(a: ChatTag, b: ChatTag) {
	return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function ChatPlaygroundContent({
	models,
	modelParam,
	promptParam,
}: ChatPlaygroundProps) {
	const isUnified = true;
	const [threads, setThreads] = useState<ChatThread[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [, setError] = useState<string | null>(null);
	const [requestError, setRequestError] =
		useState<ChatRequestErrorDetails | null>(null);
	const [baseUrl, setBaseUrl] = useState(BASE_URL);
	const {
		authLoading,
		authUser,
		handleSignOut,
		isAdmin,
		isAuthenticated,
	} = useChatAuth();
	const [debugEnabled, setDebugEnabled] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(STORAGE_KEYS.debugMode) === "true";
	});
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
	const [tagsOpen, setTagsOpen] = useState(false);
	const [tagsTarget, setTagsTarget] = useState<ChatThread | null>(null);
	const [chatTags, setChatTags] = useState<ChatTag[]>([]);
	const [activeTagId, setActiveTagId] = useState<string | null>(null);
	const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
	const [pendingNewChat, setPendingNewChat] = useState<{
		modelId: string;
		settings: ChatSettings;
		changes: SettingChange[];
	} | null>(null);
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [composerRequiresAudioInput, setComposerRequiresAudioInput] =
		useState(false);
	const [responseLayout, setResponseLayout] = useState<ChatResponseLayout>(() => {
		if (typeof window === "undefined") return "sequential";
		return window.localStorage.getItem(STORAGE_KEYS.responseLayout) ===
			"side-by-side"
			? "side-by-side"
			: "sequential";
	});
	const [temporaryThread, setTemporaryThread] = useState<ChatThread | null>(
		null,
	);
	const [previousStoredId, setPreviousStoredId] = useState<string | null>(
		null,
	);
	const [groupingNowMs] = useState(() => Date.now());

	const {
		selectableModels,
		defaultModelId,
		resolvedQueryModelId,
		queryModelIsValid,
		modelOptions,
		modelCapabilitiesById,
		providerOptions,
		providerNameById,
		getSupportedProviderIdsForModel,
		isProviderSupportedForModel,
		resolveRequestModelIdForProvider,
		resolveReplacementModelId,
		orgNameById,
		modelDisplayNameById,
		modelOrgIdById,
		modelLinkById,
		getModelCapabilities,
		modelSupportsAudioInputById,
		supportsModelAudioInput,
		isModelCapabilityCompatible,
		isModelSelectableForContext,
		getPrimaryCapabilityForModel,
	} = useChatModelCatalog({ models, modelParam });
	const queryPrompt = promptParam ?? "";
	const appliedQueryModelIdRef = useRef<string | null>(null);
	const [personalization, setPersonalization] =
		useState<PersonalizationSettings>({
			name: "",
			role: "",
			notes: "",
			accentColor: "#111111",
		});

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

	const handleResponseLayoutChange = useCallback(
		(value: ChatResponseLayout) => {
			setResponseLayout(value);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEYS.responseLayout, value);
			}
		},
		[],
	);

	const handleExportChats = useCallback(async () => {
		const chats = await getAllChats("text");
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

	const activeThread = useMemo(() => {
		if (temporaryMode && temporaryThread) return temporaryThread;
		return threads.find((thread) => thread.id === activeId) ?? null;
	}, [temporaryMode, temporaryThread, threads, activeId]);
	const activeModelCapability = useMemo(() => {
		if (!activeThread?.modelId) return null;
		return "responses" as UnifiedChatEndpoint;
	}, [activeThread?.modelId]);
	const allTags = useMemo(() => {
		const byId = new Map<string, ChatTag>();
		for (const tag of chatTags) {
			byId.set(tag.id, tag);
		}
		for (const thread of threads) {
			for (const tag of thread.tags ?? []) {
				if (!byId.has(tag.id)) {
					byId.set(tag.id, tag);
				}
			}
		}
		return Array.from(byId.values()).sort(compareChatTags);
	}, [chatTags, threads]);
	const activeVisibleTagId = useMemo(
		() =>
			activeTagId && allTags.some((tag) => tag.id === activeTagId)
				? activeTagId
				: null,
		[activeTagId, allTags],
	);
	const visibleThreads = useMemo(() => {
		if (!activeVisibleTagId) return threads;
		return threads.filter((thread) =>
			thread.tags?.some((tag) => tag.id === activeVisibleTagId),
		);
	}, [activeVisibleTagId, threads]);
	const { sortedThreads, groupedThreads } = useGroupedChatThreads(
		visibleThreads,
		groupingNowMs,
	);

	const persistThread = useCallback(async (thread: ChatThread) => {
		await upsertChat(thread, "text");
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
		async (existing: ChatThread[]) => {
			if (existing.length > 0) return existing;
			const id = generateId();
			const createdAt = nowIso();
			const newThread: ChatThread = {
				id,
				title: "New chat",
				titleLocked: false,
				modelId: "",
				createdAt,
				updatedAt: createdAt,
				messages: [],
				settings: {
					...DEFAULT_SETTINGS,
					systemPrompt: buildDefaultSystemPrompt(""),
				},
			};
			await upsertChat(newThread, "text");
			return [newThread];
		},
		[],
	);

	useEffect(() => {
		let mounted = true;
		(async () => {
			const storedBase =
				window.localStorage.getItem(STORAGE_KEYS.baseUrl) ?? BASE_URL;
			const storedActive = window.localStorage.getItem(
				STORAGE_KEYS.activeChatId,
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
			if (!mounted) return;
			window.localStorage.removeItem(STORAGE_KEYS.apiKey);
			setBaseUrl(storedBase);
			setPersonalization({
				name: storedPersonalName,
				role: storedPersonalRole,
				notes: storedPersonalNotes,
				accentColor: storedAccent,
			});

			const [chats, storedTags] = await Promise.all([
				getAllChats("text"),
				getAllChatTags(),
			]);
			const normalized = await ensureInitialThread(chats);
			if (!mounted) return;
			setThreads(normalized);
			setChatTags(storedTags.sort(compareChatTags));

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
		ensureInitialThread,
	]);

	useEffect(() => {
		if (!activeThread?.modelId) return;
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

	const createThreadWithSettings = useCallback(
		async (modelId: string, settings: ChatSettings) => {
			setError(null);
			const id = generateId();
			const createdAt = nowIso();
			const normalizedSettings =
				modelId.trim().length > 0
					? settings
					: {
							...settings,
							compareModelIds: [],
						};
			const systemPrompt =
				normalizedSettings.systemPrompt ?? buildDefaultSystemPrompt(modelId);
			const modelOverridesById = ensureModelOverridesForIds(normalizedSettings, [
				modelId,
				...(normalizedSettings.compareModelIds ?? []),
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
					...normalizedSettings,
					systemPrompt,
					modelOverridesById,
				},
			};
			await upsertChat(newThread, "text");
			setThreads((prev) => [newThread, ...prev]);
			setActiveThread(newThread);
		},
		[setActiveThread],
	);

	const createThread = useCallback(async () => {
		const selectedModel = "";
		if (activeThread) {
			const comparisonModelId = activeThread.modelId || selectedModel;
			const comparisonModelDisplayName =
				comparisonModelId
					? activeThread.settings.modelOverridesById?.[
							comparisonModelId
						]?.displayName?.trim() ||
						modelDisplayNameById[comparisonModelId]
					: undefined;
			const changes = getChangedSettings(
				activeThread.settings,
				comparisonModelId,
				comparisonModelDisplayName,
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
	}, [activeThread, createThreadWithSettings, modelDisplayNameById]);

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
			providerId?: string | null,
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
				const resolvedProviderId =
					providerId && providerId !== "auto"
						? providerId
						: message.providerId ?? thread.settings.providerId;
				return {
					...message,
					modelId: message.modelId ?? thread.modelId,
					providerId: resolvedProviderId,
					providerName:
						(resolvedProviderId
							? providerNameById.get(resolvedProviderId)
							: null) ??
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
		[applyMessageUpdate, orgNameById, providerNameById],
	);

	const handleSaveSettings = useCallback(() => {
		window.localStorage.setItem(
			STORAGE_KEYS.baseUrl,
			baseUrl.trim() || BASE_URL,
		);
		setSettingsOpen(false);
	}, [baseUrl]);

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
			const selectedModelId = requestModelId ?? thread.modelId;
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
			const endpoint: UnifiedChatEndpoint = "responses";
			const effectiveModelSettings = getEffectiveModelSettings(
				thread,
				selectedModelId,
			);
			const effectiveProviderId = isProviderSupportedForModel(
				selectedModelId,
				effectiveModelSettings.providerId,
			)
				? effectiveModelSettings.providerId
				: "auto";
			const requestExecutionModelId = resolveRequestModelIdForProvider(
				selectedModelId,
				effectiveProviderId,
			);
			const wantsImageModalities =
				endpoint === "responses" &&
				(effectiveModelSettings.imageOutputEnabled ||
					shouldRequestImageModalities(selectedModelId));
			const streamEnabled =
				endpoint === "responses" &&
				Boolean(effectiveModelSettings.stream) &&
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
						} else if (attachment.isVideo) {
							contentParts.push({
								type: "input_video",
								url: attachment.dataUrl,
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
				model: requestExecutionModelId,
			};
			const setOptionalRequestNumber = (
				key: string,
				value: number | null | undefined,
			) => {
				if (typeof value === "number" && Number.isFinite(value)) {
					requestBody[key] = value;
				}
			};
			setOptionalRequestNumber("temperature", effectiveModelSettings.temperature);
			setOptionalRequestNumber(
				"max_output_tokens",
				effectiveModelSettings.maxOutputTokens,
			);
			setOptionalRequestNumber("top_p", effectiveModelSettings.topP);
			setOptionalRequestNumber("top_k", effectiveModelSettings.topK);
			setOptionalRequestNumber("min_p", effectiveModelSettings.minP);
			setOptionalRequestNumber("top_a", effectiveModelSettings.topA);
			setOptionalRequestNumber(
				"presence_penalty",
				effectiveModelSettings.presencePenalty,
			);
			setOptionalRequestNumber(
				"frequency_penalty",
				effectiveModelSettings.frequencyPenalty,
			);
			setOptionalRequestNumber(
				"repetition_penalty",
				effectiveModelSettings.repetitionPenalty,
			);
			setOptionalRequestNumber("seed", effectiveModelSettings.seed);
			if (endpoint === "responses") {
				requestBody.input = input;
				requestBody.meta = true;
				requestBody.stream = streamEnabled;
				if (wantsImageModalities) {
					requestBody.modalities = ["text", "image"];
				}
				const apiServerToolsEnabled =
					sendPayload?.apiServerToolsEnabled ??
					effectiveModelSettings.apiServerToolsEnabled ??
					DEFAULT_SETTINGS.apiServerToolsEnabled;
				const datetimeTimezones = getDefaultDatetimeTimezones();
				const tools = isUnified && apiServerToolsEnabled
					? buildServerToolDefinitions(
							sendPayload?.serverTools ??
								effectiveModelSettings.serverTools ??
								DEFAULT_SERVER_TOOLS,
							sendPayload?.serverToolConfigs ??
								effectiveModelSettings.serverToolConfigs,
							{ datetimeTimezones },
						)
					: [];
				if (tools.length > 0) {
					requestBody.tools = tools;
				}
			}

			if (effectiveProviderId && effectiveProviderId !== "auto") {
				requestBody.provider = {
					only: [effectiveProviderId],
				};
			}
			if (endpoint === "responses" && effectiveModelSettings.reasoningEnabled) {
				requestBody.reasoning = {
					effort: effectiveModelSettings.reasoningEffort ?? "medium",
					summary: "auto",
				};
			}

			setError(null);
			setRequestError(null);
			if (manageSendingState) {
				setIsSending(true);
			}

			const performanceRunId = sendPayload?.performanceRunId;
			const requestStartedAt = performance.now();
			let firstTokenAt: number | null = null;
			let finalUsage: Record<string, unknown> | null = null;
			let finalMeta: Record<string, unknown> | null = null;
			let finalProviderId: string | null =
				effectiveProviderId && effectiveProviderId !== "auto"
					? effectiveProviderId
					: null;
			let latestThread = thread;
			const assistantId = targetAssistantId ?? generateId();
			let streamingMessageId = assistantId;
			let variantIndex = 0;
			let assistantContent = "";
			let placeholderReady = false;

			const resolveMetaProviderId = (
				meta: Record<string, unknown> | null | undefined,
			): string | null => {
				if (!meta) return null;
				if (
					typeof meta.provider === "string" &&
					meta.provider.trim().length > 0
				) {
					return meta.provider.trim();
				}
				const routing =
					meta.routing &&
					typeof meta.routing === "object" &&
					!Array.isArray(meta.routing)
						? (meta.routing as Record<string, unknown>)
						: null;
				if (
					routing &&
					typeof routing.selected_provider === "string" &&
					routing.selected_provider.trim().length > 0
				) {
					return routing.selected_provider.trim();
				}
				return null;
			};

			const resolvePayloadProviderId = (payload: any): string | null => {
				for (const candidate of [
					payload?.provider,
					payload?.response?.provider,
				]) {
					if (typeof candidate === "string" && candidate.trim().length > 0) {
						return candidate.trim();
					}
				}
				return (
					resolveMetaProviderId(payload?.meta ?? null) ??
					resolveMetaProviderId(payload?.response?.meta ?? null)
				);
			};

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
					streamingMessageId = targetAssistantId;
					placeholderReady = true;
					await updateThreadState(latestThread, false);
				} else {
					const orgId = getOrgId(selectedModelId);
					const createdAt = nowIso();
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "Generating...",
						createdAt,
						modelId: selectedModelId,
						providerId: effectiveProviderId,
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
			): Record<string, unknown> => {
				const providerId =
					finalProviderId ??
					resolveMetaProviderId(finalMeta) ??
					(effectiveProviderId && effectiveProviderId !== "auto"
						? effectiveProviderId
						: null);
				return {
					...(compareMeta ?? {}),
					...(finalMeta ?? {}),
					...(providerId ? { provider: providerId } : {}),
					client: clientMeta,
				};
			};

			try {
				markChatPerformance(performanceRunId, "request-dispatch");
				const response = await fetch("/api/chat/text", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						baseUrl: base,
						requestBody,
						appHeaders: APP_HEADERS,
						debug: shouldDebug,
					}),
				});
				markChatPerformance(performanceRunId, "response-headers");
				// eslint-disable-next-line no-console
				console.log(
					"[chat] response",
					response.status,
					response.statusText,
				);

				if (!response.ok) {
					throw await parseChatErrorResponse(response);
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
						assistantContent = `[Open result](${objectUrl})`;
					}
					markChatPerformance(performanceRunId, "stream-first-frame");

					if (data) {
						const reply = extractResponseText(data);
						const images = extractResponseImages(data);
						finalUsage =
							data?.usage ??
							data?.response?.usage ??
							data?.response?.output?.usage ??
							null;
						finalMeta = data?.meta ?? data?.response?.meta ?? null;
						finalProviderId =
							resolvePayloadProviderId(data) ?? finalProviderId;
						const clientMeta = buildClientMeta(performance.now());
						const mergedMeta = mergeMeta(clientMeta);
						const reasoningText =
							endpoint === "responses"
								? extractReasoningText(data)
								: "";
						if (reasoningText) {
							mergedMeta.reasoning_text = reasoningText;
						}
						const toolCalls = extractResponseToolCalls(data);
						if (toolCalls.length) {
							mergedMeta.tool_calls = toolCalls;
						}
						const traceEvents: ChatTraceEvent[] = [];
						if (reasoningText) {
							traceEvents.push({
								id: "reasoning",
								type: "reasoning",
								sequence: traceEvents.length,
								text: reasoningText,
							});
						}
						for (const toolCall of toolCalls) {
							traceEvents.push({
								id: `tool:${toolCall.id}`,
								type: "tool_call",
								sequence: traceEvents.length,
								toolCallId: toolCall.id,
							});
						}
						const totalCostUsd = extractTotalCostUsd(finalUsage);
						if (totalCostUsd) {
							mergedMeta.total_cost_usd = totalCostUsd;
						}
						assistantContent = appendImagesToText(reply, images);
						if (!assistantContent) {
							assistantContent = "Request completed.";
						}
						if (assistantContent) {
							traceEvents.push({
								id: "response",
								type: "response",
								sequence: traceEvents.length,
								text: assistantContent,
							});
						}
						if (traceEvents.length) {
							mergedMeta.trace_events = traceEvents;
						}
						markChatPerformance(performanceRunId, "stream-first-token");
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
								finalProviderId,
							);
							await updateThreadState(latestThread, !temporaryMode);
							markChatPerformance(performanceRunId, "stream-complete");
							return;
						}
						markChatPerformance(performanceRunId, "stream-complete");
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
							finalProviderId,
						);
						await updateThreadState(latestThread, !temporaryMode);
						markChatPerformance(performanceRunId, "stream-complete");
						return;
					}
					markChatPerformance(performanceRunId, "stream-complete");
					return;
				}

				let buffer = "";
				const streamToolCalls = new Map<string, ChatToolCall>();
				const streamToolAliases = new Map<string, string>();
				const resolveStreamToolId = (value: unknown) => {
					if (typeof value !== "string" || !value.trim()) return null;
					const trimmed = value.trim();
					return streamToolAliases.get(trimmed) ?? trimmed;
				};
				const aliasStreamToolId = (
					source: unknown,
					target: string | null,
				) => {
					if (
						typeof source !== "string" ||
						!source.trim() ||
						!target
					) {
						return;
					}
					streamToolAliases.set(source.trim(), target);
				};
				const upsertStreamToolCall = (toolCall: ChatToolCall) => {
					const existing = streamToolCalls.get(toolCall.id);
					const next: ChatToolCall = existing
						? {
								...existing,
								...toolCall,
								input: toolCall.input ?? existing.input,
								inputText:
									toolCall.inputText ?? existing.inputText,
								output: toolCall.output ?? existing.output,
								errorText:
									toolCall.errorText ?? existing.errorText,
								status:
									toolCall.status === "running" &&
									existing.status !== "running"
										? existing.status
										: toolCall.status,
							}
						: toolCall;
					streamToolCalls.set(next.id, next);
				};
				const appendStreamToolArguments = (
					id: string,
					deltaText: string,
				) => {
					const existing =
						streamToolCalls.get(id) ??
						({
							id,
							type: "function_call",
							name: "tool",
							status: "running",
						} satisfies ChatToolCall);
					const inputText = `${existing.inputText ?? ""}${deltaText}`;
					upsertStreamToolCall({
						...existing,
						inputText,
						status: "running",
					});
				};
				const getStreamToolCalls = () =>
					Array.from(streamToolCalls.values());
				const streamTraceEvents = new Map<string, ChatTraceEvent>();
				let nextTraceSequence = 0;
				let activeResponseTraceId: string | null = null;
				const ensureTraceEvent = (
					id: string,
					create: (sequence: number) => ChatTraceEvent,
				) => {
					const existing = streamTraceEvents.get(id);
					if (existing) return existing;
					const event = create(nextTraceSequence++);
					streamTraceEvents.set(id, event);
					return event;
				};
				const upsertReasoningTrace = (text: string) => {
					if (!text) return;
					ensureTraceEvent("reasoning", (sequence) => ({
						id: "reasoning",
						type: "reasoning",
						sequence,
						text,
					}));
					const event = streamTraceEvents.get("reasoning");
					if (event?.type === "reasoning") {
						streamTraceEvents.set("reasoning", {
							...event,
							text,
						});
					}
				};
				const upsertToolTrace = (toolCallId: string) => {
					if (!toolCallId) return;
					activeResponseTraceId = null;
					const id = `tool:${toolCallId}`;
					ensureTraceEvent(id, (sequence) => ({
						id,
						type: "tool_call",
						sequence,
						toolCallId,
					}));
				};
				const upsertResponseTrace = (text: string) => {
					if (!text) return;
					const id =
						activeResponseTraceId ?? `response:${nextTraceSequence}`;
					activeResponseTraceId = id;
					ensureTraceEvent(id, (sequence) => ({
						id,
						type: "response",
						sequence,
						text,
					}));
					const event = streamTraceEvents.get(id);
					if (event?.type === "response") {
						streamTraceEvents.set(id, {
							...event,
							text,
						});
					}
				};
				const getTraceEvents = () =>
					Array.from(streamTraceEvents.values()).sort(
						(a, b) => a.sequence - b.sequence,
					);
				const hasPendingToolCallTrace = () => {
					const traceEvents = getTraceEvents();
					let lastToolSequence = -1;
					let lastResponseSequence = -1;
					for (const event of traceEvents) {
						if (event.type === "tool_call") {
							lastToolSequence = Math.max(
								lastToolSequence,
								event.sequence,
							);
						} else if (
							event.type === "response" &&
							event.text.trim()
						) {
							lastResponseSequence = Math.max(
								lastResponseSequence,
								event.sequence,
							);
						}
					}
					return lastToolSequence > lastResponseSequence;
				};

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
					const orgId = getOrgId(selectedModelId);
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "",
						createdAt: nowIso(),
						modelId: selectedModelId,
						providerId: effectiveProviderId,
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
								finalProviderId,
							);
							await updateThreadState(latestThread, false);
						});
					}, delay);
				};
				let reasoningContent = "";
				const reasoningSummaries: Record<number, string> = {};
				const buildStreamingMetaPartial = () => {
					const toolCalls = getStreamToolCalls();
					const traceEvents = getTraceEvents();
					if (
						!reasoningContent &&
						toolCalls.length === 0 &&
						traceEvents.length === 0
					) {
						return undefined;
					}
					return {
						...(compareMeta ?? {}),
						...(finalMeta ?? {}),
						...(reasoningContent
							? { reasoning_text: reasoningContent }
							: {}),
						...(toolCalls.length ? { tool_calls: toolCalls } : {}),
						...(traceEvents.length
							? { trace_events: traceEvents }
							: {}),
					};
				};

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					markChatPerformance(performanceRunId, "stream-first-frame");
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
								finalProviderId =
									resolvePayloadProviderId(parsed) ??
									finalProviderId;
								let responseText = "";
								let delta = "";
								let reasoningDelta = "";
								let reasoningUpdated = false;
								let summaryUpdated = false;
								let toolCallUpdated = false;
					const summaryIndex =
						typeof parsed?.summary_index === "number"
							? parsed.summary_index
							: typeof parsed?.summaryIndex === "number"
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
									frameType === "response.output_item.added" ||
									frameType === "response.output_item.done"
								) {
									const item =
										parsed?.item &&
										typeof parsed.item === "object"
											? {
													...parsed.item,
													status:
														parsed.item.status ??
														(frameType ===
														"response.output_item.added"
															? "in_progress"
															: "completed"),
												}
											: null;
									const toolCalls = extractResponseToolCalls({
										output: item ? [item] : [],
									});
									for (const toolCall of toolCalls) {
										aliasStreamToolId(
											parsed?.item?.id,
											toolCall.id,
										);
										aliasStreamToolId(
											parsed?.item?.call_id,
											toolCall.id,
										);
										aliasStreamToolId(
											parsed?.item_id,
											toolCall.id,
										);
										upsertStreamToolCall(toolCall);
										upsertToolTrace(toolCall.id);
										toolCallUpdated = true;
									}
									if (
										toolCalls.length === 0 &&
										frameType ===
											"response.output_item.done"
									) {
										responseText = extractResponseText({
											output: item ? [item] : [],
										});
									}
								} else if (
									frameType ===
									"response.function_call_arguments.delta"
								) {
									const resolvedId =
										resolveStreamToolId(parsed?.item_id);
									if (
										resolvedId &&
										typeof parsed?.delta === "string"
									) {
										appendStreamToolArguments(
											resolvedId,
											parsed.delta,
										);
										upsertToolTrace(resolvedId);
										toolCallUpdated = true;
									}
								} else if (
									frameType ===
									"response.function_call_arguments.done"
								) {
									const resolvedId =
										resolveStreamToolId(parsed?.item_id);
									if (resolvedId) {
										const existing =
											streamToolCalls.get(resolvedId);
										const toolCalls =
											extractResponseToolCalls({
												output: [
													{
														type: "function_call",
														id: resolvedId,
														call_id: resolvedId,
														name:
															parsed?.name ??
															existing?.name,
														arguments:
															parsed?.arguments ??
															existing?.inputText,
														status: "completed",
													},
												],
											});
										for (const toolCall of toolCalls) {
											upsertStreamToolCall(toolCall);
											upsertToolTrace(toolCall.id);
											toolCallUpdated = true;
										}
									}
								} else if (
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
								} else if (
									frameType ===
									"response.content_part.done"
								) {
									const partText =
										parsed?.part?.text ??
										parsed?.content?.text ??
										parsed?.text;
									if (typeof partText === "string") {
										responseText = partText;
									}
								} else if (frameType === "response.completed") {
									responseText = extractResponseText(
										parsed?.response ?? parsed,
									);
									for (const toolCall of extractResponseToolCalls(
										parsed?.response ?? parsed,
									)) {
										upsertStreamToolCall(toolCall);
										upsertToolTrace(toolCall.id);
										toolCallUpdated = true;
									}
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
										if (reasoningContent) {
											upsertReasoningTrace(
												reasoningContent,
											);
										}
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
									upsertReasoningTrace(reasoningContent);
									reasoningUpdated = true;
								}
								const hasSummary =
									Object.keys(reasoningSummaries).length > 0;
								if (delta) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									markChatPerformance(
										performanceRunId,
										"stream-first-token",
									);
									assistantContent += delta;
									upsertResponseTrace(assistantContent);
									if (reasoningDelta && !hasSummary) {
										if (
											!reasoningContent.endsWith(
												reasoningDelta,
											)
										) {
											reasoningContent += reasoningDelta;
										}
										upsertReasoningTrace(reasoningContent);
									}
									scheduleUpdate(buildStreamingMetaPartial());
								} else if (reasoningDelta && !hasSummary) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									markChatPerformance(
										performanceRunId,
										"stream-first-token",
									);
									if (
										!reasoningContent.endsWith(
											reasoningDelta,
										)
									) {
										reasoningContent += reasoningDelta;
									}
									upsertReasoningTrace(reasoningContent);
									scheduleUpdate(buildStreamingMetaPartial());
								} else if (reasoningUpdated) {
									scheduleUpdate(buildStreamingMetaPartial());
								} else if (
									responseText &&
									responseText !== assistantContent
								) {
									if (!firstTokenAt) {
										firstTokenAt = performance.now();
									}
									markChatPerformance(
										performanceRunId,
										"stream-first-token",
									);
									assistantContent = responseText;
									upsertResponseTrace(assistantContent);
									scheduleUpdate(buildStreamingMetaPartial());
								} else if (toolCallUpdated) {
									scheduleUpdate(buildStreamingMetaPartial());
								}
						} catch {
							// ignore malformed chunks
						}
					}
				}

				if (hasPendingToolCallTrace()) {
					const toolCalls = getStreamToolCalls();
					const toolResults = buildClientDatetimeToolResults(
						toolCalls,
						getDefaultDatetimeTimezones(),
					);
					if (toolResults) {
						for (const result of toolResults) {
							const toolCall = streamToolCalls.get(result.toolCallId);
							if (!toolCall) continue;
							upsertStreamToolCall({
								...toolCall,
								output: result.content,
								status: "completed",
							});
						}
						const continuationInput = [
							...input,
							...toolCalls.map((toolCall) => ({
								type: "function_call",
								call_id: toolCall.id,
								name: toolCall.name,
								arguments:
									toolCall.inputText ??
									JSON.stringify(toolCall.input ?? {}),
							})),
							...toolResults.map((result) => ({
								type: "function_call_output",
								call_id: result.toolCallId,
								output: result.content,
							})),
						];
						const continuationBody = {
							...requestBody,
							input: continuationInput,
							stream: false,
							tools: undefined,
							tool_choice: undefined,
						};
						const continuationResponse = await fetch(
							"/api/chat/text",
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									baseUrl: base,
									requestBody: continuationBody,
									appHeaders: APP_HEADERS,
									debug: shouldDebug,
								}),
							},
						);
						if (continuationResponse.ok) {
							const contentType =
								continuationResponse.headers.get(
									"content-type",
								) ?? "";
							const continuationData = contentType.includes(
								"application/json",
							)
								? await continuationResponse.json()
								: {
										output_text:
											await continuationResponse.text(),
									};
							const continuationText =
								extractResponseText(continuationData);
							const continuationImages = extractResponseImages(
								continuationData,
							);
							const nextContent = appendImagesToText(
								continuationText,
								continuationImages,
							);
							if (nextContent) {
								assistantContent = nextContent;
								upsertResponseTrace(assistantContent);
							}
							finalUsage =
								continuationData?.usage ??
								continuationData?.response?.usage ??
								finalUsage;
							finalMeta =
								continuationData?.meta ??
								continuationData?.response?.meta ??
								finalMeta;
							finalProviderId =
								resolvePayloadProviderId(continuationData) ??
								finalProviderId;
						} else {
							throw await parseChatErrorResponse(
								continuationResponse,
							);
						}
					}
				}

				const clientMeta = buildClientMeta(performance.now());
				const mergedMeta = mergeMeta(clientMeta);
				if (reasoningContent) {
					mergedMeta.reasoning_text = reasoningContent;
				}
				const toolCalls = getStreamToolCalls();
				if (toolCalls.length) {
					mergedMeta.tool_calls = toolCalls;
				}
				const traceEvents = getTraceEvents();
				if (traceEvents.length) {
					mergedMeta.trace_events = traceEvents;
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
					finalProviderId,
				);

				await updateThreadState(latestThread, !temporaryMode);
				markChatPerformance(performanceRunId, "stream-complete");
			} catch (err) {
				markChatPerformance(performanceRunId, "request-error");
				const message =
					err instanceof Error
						? err.message
						: "Failed to send message.";
				const structuredError = err as ChatErrorPayload;
				const errorCode =
					typeof structuredError?.code === "string"
						? structuredError.code
						: "";
				setError(message);
				const nextRequestError: ChatRequestErrorDetails = {
					status:
						typeof structuredError?.status === "number"
							? structuredError.status
							: null,
					message,
					errorCode: errorCode || null,
					requestId:
						typeof structuredError?.requestId === "string"
							? structuredError.requestId
							: null,
					description:
						typeof structuredError?.description === "string"
							? structuredError.description
							: null,
					details: Array.isArray(structuredError?.details)
						? structuredError.details
						: [],
					routingDiagnostics:
						structuredError?.routingDiagnostics ?? null,
					rawPayload: structuredError?.rawPayload ?? null,
					modelId: selectedModelId,
					providerId: effectiveProviderId ?? null,
					endpoint,
					timestamp: nowIso(),
				};
				setRequestError(nextRequestError);
				if (latestThread) {
					const errorMeta = {
						...(compareMeta ?? {}),
						chat_request_error: nextRequestError,
					};
					const existingMessage = latestThread.messages.find(
						(m) => m.id === streamingMessageId
					);
					if (existingMessage) {
						latestThread = updateAssistantVariant(
							latestThread,
							streamingMessageId,
							variantIndex,
							message,
							undefined,
							errorMeta,
						);
					} else {
						const orgId = getOrgId(selectedModelId);
						const errorMessage: ChatMessage = {
							id: generateId(),
							role: "assistant",
							content: message,
							createdAt: nowIso(),
							modelId: selectedModelId,
							providerId: latestThread.settings.providerId,
							providerName:
								orgNameById[orgId] ?? formatOrgLabel(orgId),
							variants: [
								{
									id: generateId(),
									content: message,
									createdAt: nowIso(),
									meta: errorMeta,
								},
							],
							activeVariantIndex: 0,
							meta: errorMeta,
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
				markChatPerformance(performanceRunId, "send-complete");
			}
		},
		[
			baseUrl,
			isUnified,
			personalization,
			shouldDebug,
			appendAssistantVariant,
			isProviderSupportedForModel,
			resolveRequestModelIdForProvider,
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
	const normalizeThreadForAvailableModels = useCallback(
		(thread: ChatThread): { thread: ChatThread; changed: boolean } => {
			if (!thread.modelId) return { thread, changed: false };

			let changed = false;
			const notices: string[] = [];
			const currentOverrides = thread.settings.modelOverridesById ?? {};
			const nextOverrides: Record<string, Partial<ChatModelSettings>> = {};
			let nextModelId = thread.modelId;
			let nextSystemPrompt = thread.settings.systemPrompt;

			const primaryResolution = resolveReplacementModelId(thread.modelId, {
				allowDefaultFallback: true,
			});
			if (
				primaryResolution.modelId &&
				primaryResolution.modelId !== thread.modelId
			) {
				const previousDisplayName =
					currentOverrides[thread.modelId]?.displayName ?? "";
				const nextDisplayName =
					currentOverrides[primaryResolution.modelId]?.displayName ?? "";
				const previousDefaultPrompt = buildDefaultSystemPrompt(
					thread.modelId,
					previousDisplayName,
				);
				if (
					(thread.settings.systemPrompt ?? "").trim() ===
					previousDefaultPrompt.trim()
				) {
					nextSystemPrompt = buildDefaultSystemPrompt(
						primaryResolution.modelId,
						nextDisplayName,
					);
				}
				nextModelId = primaryResolution.modelId;
				changed = true;
				notices.push(
					primaryResolution.reason === "successor"
						? `Primary model \`${thread.modelId}\` is no longer available. Switched to its latest available successor \`${primaryResolution.modelId}\`.`
						: `Primary model \`${thread.modelId}\` is no longer available. Switched to fallback model \`${primaryResolution.modelId}\`.`,
				);
			}

			const nextCompareModelIds: string[] = [];
			for (const compareModelId of thread.settings.compareModelIds ?? []) {
				if (!compareModelId || compareModelId === nextModelId) continue;
				const compareResolution = resolveReplacementModelId(compareModelId);
				if (!compareResolution.modelId) {
					changed = true;
					notices.push(
						`Removed compare model \`${compareModelId}\` because it is no longer available.`,
					);
					continue;
				}
				if (compareResolution.modelId !== compareModelId) {
					changed = true;
					notices.push(
						`Compare model \`${compareModelId}\` is no longer available. Switched to successor \`${compareResolution.modelId}\`.`,
					);
				}
				if (
					compareResolution.modelId !== nextModelId &&
					!nextCompareModelIds.includes(compareResolution.modelId)
				) {
					nextCompareModelIds.push(compareResolution.modelId);
				}
			}

			const selectedModelIds = new Set<string>([
				nextModelId,
				...nextCompareModelIds,
			]);
			for (const [modelId, override] of Object.entries(currentOverrides)) {
				if (!selectedModelIds.has(modelId)) {
					changed = true;
					continue;
				}
				const nextOverride = { ...override };
				if (!isProviderSupportedForModel(modelId, nextOverride.providerId)) {
					nextOverride.providerId = "auto";
					changed = true;
					notices.push(
						`Provider lock \`${override.providerId}\` for \`${modelId}\` is no longer available. Reset to \`Auto (Gateway)\`.`,
					);
				}
				nextOverrides[modelId] = nextOverride;
			}

			const primaryOverride = nextOverrides[nextModelId];
			const primaryProviderId =
				primaryOverride?.providerId ?? thread.settings.providerId;
			let nextProviderId = thread.settings.providerId;
			if (!isProviderSupportedForModel(nextModelId, primaryProviderId)) {
				if (primaryOverride?.providerId !== undefined) {
					nextOverrides[nextModelId] = {
						...primaryOverride,
						providerId: "auto",
					};
				} else {
					nextProviderId = "auto";
				}
				changed = true;
				notices.push(
					`Provider lock \`${primaryProviderId}\` for \`${nextModelId}\` is no longer available. Reset to \`Auto (Gateway)\`.`,
				);
			}

			const nextThread: ChatThread = {
				...thread,
				modelId: nextModelId,
				settings: {
					...thread.settings,
					systemPrompt: nextSystemPrompt,
					providerId: nextProviderId,
					compareModelIds: nextCompareModelIds,
					compareMode: nextCompareModelIds.length > 0,
					modelOverridesById: ensureModelOverridesForIds(
						{
							...thread.settings,
							systemPrompt: nextSystemPrompt,
							providerId: nextProviderId,
							compareModelIds: nextCompareModelIds,
							compareMode: nextCompareModelIds.length > 0,
							modelOverridesById: nextOverrides,
						},
						[nextModelId, ...nextCompareModelIds],
					),
				},
				updatedAt: changed ? nowIso() : thread.updatedAt,
			};

			if (notices.length > 0) {
				const noticeKey = notices.join("||");
				const hasNotice = nextThread.messages.some(
					(message) =>
						(message.meta as { chat_state_notice_key?: string } | null)
							?.chat_state_notice_key === noticeKey,
				);
				if (!hasNotice) {
					changed = true;
					nextThread.messages = [
						...nextThread.messages,
						{
							id: generateId(),
							role: "assistant",
							content: [
								"Updated this chat to match current model availability:",
								...notices.map((notice) => `- ${notice}`),
							].join("\n"),
							createdAt: nowIso(),
							modelId: nextThread.modelId,
							meta: {
								chat_state_notice_key: noticeKey,
								chat_state_notice_type: "availability_migration",
							},
						},
					];
					nextThread.updatedAt = nowIso();
				}
			}

			return { thread: nextThread, changed };
		},
		[
			isProviderSupportedForModel,
			resolveReplacementModelId,
		],
	);
	useEffect(() => {
		if (!threads.length || !selectableModels.length) return;
		let cancelled = false;
		(async () => {
			const normalizedThreads = threads.map((thread) =>
				normalizeThreadForAvailableModels(thread),
			);
			const changedThreads = normalizedThreads
				.filter((result) => result.changed)
				.map((result) => result.thread);
			if (!changedThreads.length) return;
			await Promise.all(
				changedThreads.map((thread) => upsertChat(thread, "text")),
			);
			if (cancelled) return;
			setThreads(normalizedThreads.map((result) => result.thread));
		})();
		return () => {
			cancelled = true;
		};
	}, [normalizeThreadForAvailableModels, selectableModels.length, threads]);

	const handleSend = useCallback(
		async (payload: ChatSendPayload) => {
			const performanceRunId = payload.performanceRunId;
			markChatPerformance(performanceRunId, "playground-send-received");
			if (!activeThread || isSending) return;
			const content = buildUserMessageContent(payload);
			if (!content.trim() && payload.attachments.length === 0) return;
			if (!isAuthenticated) {
				setError("Sign in to start chatting.");
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

			const userMessageMeta: Record<string, unknown> = {
				request_context: {
					model_id: activeThread.modelId,
					compare_model_ids: activeThread.settings.compareModelIds ?? [],
					reasoning_enabled: Boolean(activeThread.settings.reasoningEnabled),
					reasoning_effort: activeThread.settings.reasoningEffort ?? "medium",
					web_search_enabled: payload.webSearchEnabled,
					api_server_tools_enabled: payload.apiServerToolsEnabled,
					server_tools: payload.serverTools,
					server_tool_configs: payload.serverToolConfigs,
					attachments_count: payload.attachments.length,
				},
			};
			if (inlineAttachmentPreviews.length) {
				userMessageMeta.attachment_previews = inlineAttachmentPreviews;
			}

			const userMessage: ChatMessage = {
				id: generateId(),
				role: "user",
				content,
				createdAt: nowIso(),
				meta: userMessageMeta,
			};
			linkChatPerformanceMessage(performanceRunId, userMessage.id);
			markChatPerformance(performanceRunId, "user-message-created");

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

			markChatPerformance(performanceRunId, "thread-update-start");
			await updateThreadState(updatedThread, !temporaryMode);
			markChatPerformance(performanceRunId, "thread-update-complete");
			const inferredEndpoint: UnifiedChatEndpoint = "responses";
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
			const candidateModelIds = Array.from(
				new Set([
					updatedThread.modelId,
					...(updatedThread.settings.compareModelIds ?? []),
				]),
			).filter(Boolean);
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
			buildThreadForModel,
			executeCompletion,
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
		await upsertChat(newThread, "text");
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
			const effectiveProviderId =
				getEffectiveModelSettings(nextThread, modelId).providerId;
			if (!isProviderSupportedForModel(modelId, effectiveProviderId)) {
				const currentOverrides =
					nextThread.settings.modelOverridesById ?? {};
				const existingModelOverrides = currentOverrides[modelId] ?? {};
				nextThread.settings = {
					...nextThread.settings,
					providerId:
						existingModelOverrides.providerId === undefined
							? "auto"
							: nextThread.settings.providerId,
					modelOverridesById: {
						...currentOverrides,
						[modelId]: {
							...existingModelOverrides,
							providerId: "auto",
						},
					},
				};
			}
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEYS.lastModelId, modelId);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			getPrimaryCapabilityForModel,
			isProviderSupportedForModel,
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
				getPrimaryCapabilityForModel,
				isModelSelectableForContext,
				temporaryMode,
				updateThreadState,
			],
	);

	const updateSelectedModelOrder = useCallback(
		(ids: string[]) => {
			if (!activeThread) return;
			const currentSelectedIds = [
				activeThread.modelId,
				...(activeThread.settings.compareModelIds ?? []),
			].filter(Boolean);
			const knownSelectedIds = new Set(currentSelectedIds);
			const nextSelectedIds = Array.from(
				new Set(ids.filter((id) => knownSelectedIds.has(id))),
			);
			if (nextSelectedIds.length === 0) return;
			for (const id of currentSelectedIds) {
				if (!nextSelectedIds.includes(id)) {
					nextSelectedIds.push(id);
				}
			}
			const [nextPrimaryModelId, ...nextCompareModelIds] =
				nextSelectedIds;
			if (!nextPrimaryModelId) return;
			const currentModelDisplayName =
				activeThread.settings.modelOverridesById?.[
					activeThread.modelId
				]?.displayName ?? "";
			const nextModelDisplayName =
				activeThread.settings.modelOverridesById?.[
					nextPrimaryModelId
				]?.displayName ?? "";
			const previousDefault = buildDefaultSystemPrompt(
				activeThread.modelId,
				currentModelDisplayName,
			);
			const nextSystemPrompt =
				!activeThread.settings.systemPrompt ||
				activeThread.settings.systemPrompt === previousDefault
					? buildDefaultSystemPrompt(
							nextPrimaryModelId,
							nextModelDisplayName,
						)
					: activeThread.settings.systemPrompt;
			const nextModelOverrides = ensureModelOverridesForIds(
				activeThread.settings,
				[nextPrimaryModelId, ...nextCompareModelIds],
			);
			const nextThread: ChatThread = {
				...activeThread,
				modelId: nextPrimaryModelId,
				settings: {
					...activeThread.settings,
					systemPrompt: nextSystemPrompt,
					compareModelIds: nextCompareModelIds,
					compareMode: nextCompareModelIds.length > 0,
					modelOverridesById: nextModelOverrides,
				},
				updatedAt: nowIso(),
			};
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					STORAGE_KEYS.lastModelId,
					nextPrimaryModelId,
				);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[activeThread, temporaryMode, updateThreadState],
	);

	const addComposerModelSet = useCallback(
		(modelIds: string[]) => {
			if (!activeThread) return;
			const currentSelectedIds = [
				activeThread.modelId,
				...(activeThread.settings.compareModelIds ?? []),
			].filter(Boolean);
			const nextSelectedIds = Array.from(
				new Set([...currentSelectedIds, ...modelIds.filter(Boolean)]),
			);
			const [nextPrimaryModelId, ...candidateCompareIds] =
				nextSelectedIds;
			if (!nextPrimaryModelId) return;
			const requiredCapability =
				getPrimaryCapabilityForModel(nextPrimaryModelId);
			const nextCompareModelIds = candidateCompareIds.filter((id) =>
				isModelSelectableForContext(
					id,
					requiredCapability,
					composerRequiresAudioInput,
				),
			);
			const currentModelDisplayName =
				activeThread.settings.modelOverridesById?.[
					activeThread.modelId
				]?.displayName ?? "";
			const nextModelDisplayName =
				activeThread.settings.modelOverridesById?.[
					nextPrimaryModelId
				]?.displayName ?? "";
			const previousDefault = buildDefaultSystemPrompt(
				activeThread.modelId,
				currentModelDisplayName,
			);
			const nextSystemPrompt =
				!activeThread.settings.systemPrompt ||
				activeThread.settings.systemPrompt === previousDefault
					? buildDefaultSystemPrompt(
							nextPrimaryModelId,
							nextModelDisplayName,
						)
					: activeThread.settings.systemPrompt;
			const nextModelOverrides = ensureModelOverridesForIds(
				activeThread.settings,
				[nextPrimaryModelId, ...nextCompareModelIds],
			);
			const nextThread: ChatThread = {
				...activeThread,
				modelId: nextPrimaryModelId,
				settings: {
					...activeThread.settings,
					systemPrompt: nextSystemPrompt,
					compareModelIds: nextCompareModelIds,
					compareMode: nextCompareModelIds.length > 0,
					modelOverridesById: nextModelOverrides,
				},
				updatedAt: nowIso(),
			};
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					STORAGE_KEYS.lastModelId,
					nextPrimaryModelId,
				);
			}
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			composerRequiresAudioInput,
			getPrimaryCapabilityForModel,
			isModelSelectableForContext,
			temporaryMode,
			updateThreadState,
		],
	);

	const toggleComposerModel = useCallback(
		(modelId: string) => {
			if (!activeThread) return;
			if (!activeThread.modelId) {
				updateActiveModel(modelId);
				return;
			}
			if (activeThread.modelId === modelId) {
				removeSelectedModel(modelId);
				return;
			}
			const compare = activeThread.settings.compareModelIds ?? [];
			const nextCompare = compare.includes(modelId)
				? compare.filter((id) => id !== modelId)
				: [...compare, modelId];
			updateCompareModelIds(nextCompare);
		},
		[
			activeThread,
			removeSelectedModel,
			updateActiveModel,
			updateCompareModelIds,
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
		if (!queryModelIsValid || !resolvedQueryModelId || !activeThread) return;
		if (appliedQueryModelIdRef.current === resolvedQueryModelId) return;
		appliedQueryModelIdRef.current = resolvedQueryModelId;
		if (activeThread.modelId !== resolvedQueryModelId) {
			let cancelled = false;
			queueMicrotask(() => {
				if (!cancelled) {
					updateActiveModel(resolvedQueryModelId);
				}
			});
			return () => {
				cancelled = true;
			};
		}
	}, [
		activeThread,
		queryModelIsValid,
		resolvedQueryModelId,
		updateActiveModel,
	]);
	useEffect(() => {
		if (!activeThread?.modelId) return;
		let cancelled = false;
		let nextThread: ChatThread | null = null;
		const effectiveSettings = getEffectiveModelSettings(
			activeThread,
			activeThread.modelId,
		);
		if (
			!isProviderSupportedForModel(
				activeThread.modelId,
				effectiveSettings.providerId,
			)
		) {
			const currentOverrides = activeThread.settings.modelOverridesById ?? {};
			const existingModelOverrides =
				currentOverrides[activeThread.modelId] ?? {};
			nextThread = {
				...activeThread,
				settings: {
					...activeThread.settings,
					providerId:
						existingModelOverrides.providerId === undefined
							? "auto"
							: activeThread.settings.providerId,
					modelOverridesById: {
						...currentOverrides,
						[activeThread.modelId]: {
							...existingModelOverrides,
							providerId: "auto",
						},
					},
				},
				updatedAt: nowIso(),
			};
		}
		const compatibilityThread = nextThread ?? activeThread;
		const compareIds = compatibilityThread.settings.compareModelIds ?? [];
		if (compareIds.length) {
			const requiredCapability: UnifiedChatEndpoint = "responses";
			const normalizedCompareIds = compareIds.filter(
				(id) =>
					id &&
					id !== compatibilityThread.modelId &&
					isModelSelectableForContext(
						id,
						requiredCapability,
						composerRequiresAudioInput,
					),
			);
			const unchanged =
				normalizedCompareIds.length === compareIds.length &&
				normalizedCompareIds.every((id, index) => id === compareIds[index]);
			if (!unchanged) {
				nextThread = {
					...compatibilityThread,
					settings: {
						...compatibilityThread.settings,
						compareModelIds: normalizedCompareIds,
						compareMode: normalizedCompareIds.length > 0,
					},
					updatedAt: nowIso(),
				};
			}
		}
		if (nextThread) {
			const threadToUpdate = nextThread;
			queueMicrotask(() => {
				if (!cancelled) {
					void updateThreadState(threadToUpdate, !temporaryMode);
				}
			});
		}
		return () => {
			cancelled = true;
		};
	}, [
		activeThread,
		composerRequiresAudioInput,
		isProviderSupportedForModel,
		isModelSelectableForContext,
		temporaryMode,
		updateThreadState,
	]);
	const activeModelId = activeThread?.modelId ?? null;
	const activeCompareModelIds = activeThread?.settings.compareModelIds;
	const activeModelOverrides = activeThread?.settings.modelOverridesById;

	const handleAudioAttachmentRequirementChange = useCallback(
		(requiresAudioInput: boolean) => {
			setComposerRequiresAudioInput(requiresAudioInput);
			if (!requiresAudioInput || !activeModelId) return;
			if (supportsModelAudioInput(activeModelId)) return;
			setError(
				"Audio is attached. Select a model that supports audio input to continue.",
			);
			setModelPickerOpen(true);
		},
		[activeModelId, supportsModelAudioInput],
	);

	const handleDeleteThread = async () => {
		if (!deleteTarget) return;
		const threadId = deleteTarget.id;
		await deleteChat(threadId, "text");
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

	const handleEditTags = (thread: ChatThread) => {
		setTagsTarget(thread);
		setTagsOpen(true);
	};

	const handleTagsOpenChange = (open: boolean) => {
		setTagsOpen(open);
		if (!open) {
			setTagsTarget(null);
		}
	};

	const handleTagsSave = async (tags: ChatTag[]) => {
		if (!tagsTarget) return;
		const thread = threads.find((candidate) => candidate.id === tagsTarget.id);
		if (!thread) return;
		const sortedTags = [...tags].sort(compareChatTags);
		if (sortedTags.length > 0) {
			await upsertChatTags(sortedTags);
			setChatTags((prev) => {
				const byId = new Map(prev.map((tag) => [tag.id, tag]));
				for (const tag of sortedTags) {
					byId.set(tag.id, tag);
				}
				return Array.from(byId.values()).sort(compareChatTags);
			});
		}
		await updateStoredThread({
			...thread,
			tags: sortedTags,
			updatedAt: nowIso(),
		});
		handleTagsOpenChange(false);
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

	const selectedModelIds = useMemo(() => {
		const ids: string[] = [];
		if (activeModelId) {
			ids.push(activeModelId);
		}
		for (const id of activeCompareModelIds ?? []) {
			if (!id || id === activeModelId) continue;
			ids.push(id);
		}
		return Array.from(new Set(ids));
	}, [activeCompareModelIds, activeModelId]);
	const selectedModelDisplayNameById = useMemo(() => {
		const labels: Record<string, string> = {};
		for (const modelId of selectedModelIds) {
			const model = models.find(
				(entry) =>
					entry.selectorModelId === modelId || entry.modelId === modelId,
			);
			const defaultLabel = model?.modelName ?? formatModelLabel(modelId);
			const overrideLabel =
				activeModelOverrides?.[modelId]?.displayName?.trim();
			labels[modelId] = overrideLabel || defaultLabel;
		}
		return labels;
	}, [activeModelOverrides, models, selectedModelIds]);
	const selectedModelEnabledById = useMemo(() => {
		const enabledById: Record<string, boolean> = {};
		for (const modelId of selectedModelIds) {
			enabledById[modelId] =
				activeModelOverrides?.[modelId]?.enabled !== false;
		}
		return enabledById;
	}, [activeModelOverrides, selectedModelIds]);
	const modelSettingsChoices = useMemo(
		() => {
			const requiredCapability = activeModelCapability;
			const requiresAudioInput = composerRequiresAudioInput;
			const byId = new Map<
				string,
				{
					id: string;
					label: string;
					orgId: string;
					orgName: string;
					releaseDate: string | null;
				}
			>();
			const orderedOptions = [
				...modelOptions.active,
				...modelOptions.comingSoon,
			];
			for (const model of orderedOptions) {
				const selectorModelId = model.modelId;
				const modelCapabilities = getModelCapabilities(selectorModelId);
				if (
					requiredCapability &&
					!modelCapabilities.includes(requiredCapability)
				) {
					continue;
				}
				if (
					requiresAudioInput &&
					!supportsModelAudioInput(selectorModelId)
				) {
					continue;
				}
				if (byId.has(selectorModelId)) continue;
				// Keep selector labels canonical; nicknames are display-only in chat UI.
				const baseLabel =
					model.label || formatModelLabel(selectorModelId);
				const isDisabled =
					activeModelOverrides?.[selectorModelId]?.enabled === false;
				byId.set(selectorModelId, {
					id: selectorModelId,
					label: isDisabled ? `${baseLabel} (Off)` : baseLabel,
					orgId: model.orgId,
					orgName: model.orgName,
					releaseDate: model.releaseDate,
				});
			}
			return Array.from(byId.values());
		},
			[
				activeModelCapability,
				activeModelOverrides,
				composerRequiresAudioInput,
				getModelCapabilities,
				modelOptions.active,
				modelOptions.comingSoon,
				supportsModelAudioInput,
			],
	);
	const selectedModelLabel = useMemo(() => {
		if (!activeModelId) return "Select model";
		return (
			selectedModelDisplayNameById[activeModelId] ??
			formatModelLabel(activeModelId)
		);
	}, [activeModelId, selectedModelDisplayNameById]);
	const selectedModelsHint = useMemo(() => {
		if (selectedModelIds.length <= 1) {
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
		activeModelId,
		selectedModelDisplayNameById,
		selectedModelEnabledById,
		selectedModelIds,
	]);
	const modelSettingsModelId =
		modelSettingsTargetModelId ?? activeModelId;
	const activeModelSettings = useMemo(() => {
		if (!activeThread || !modelSettingsModelId) return null;
		return getEffectiveModelSettings(activeThread, modelSettingsModelId);
	}, [activeThread, modelSettingsModelId]);
	const dialogModelSettings: ChatModelSettings = useMemo(() => {
		if (activeModelSettings) return activeModelSettings;
		const fallbackModelId = modelSettingsModelId ?? activeModelId ?? "";
		const fallbackDisplayName =
			activeModelOverrides?.[fallbackModelId]?.displayName ?? "";
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
			apiServerToolsEnabled: DEFAULT_SETTINGS.apiServerToolsEnabled,
			serverTools: DEFAULT_SETTINGS.serverTools,
			serverToolConfigs: DEFAULT_SETTINGS.serverToolConfigs,
			imageOutputEnabled: DEFAULT_SETTINGS.imageOutputEnabled,
			enabled: true,
			displayName: "",
		};
	}, [
		activeModelSettings,
		activeModelId,
		activeModelOverrides,
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

	const updateModelSettingsForModel = useCallback(
		(modelId: string, partial: Partial<ChatModelSettings>) => {
			if (!activeThread || !modelId) return;
			const currentOverrides = activeThread.settings.modelOverridesById ?? {};
			const existingModelOverrides = currentOverrides[modelId] ?? {};
			const nextPartial = { ...partial };
			if (typeof partial.displayName === "string" && partial.systemPrompt === undefined) {
				const previousDisplayName =
					typeof existingModelOverrides.displayName === "string"
						? existingModelOverrides.displayName
						: "";
				const nextDisplayName = partial.displayName;
				const previousDefaultPrompt = buildDefaultSystemPrompt(
					modelId,
					previousDisplayName,
				);
				const nextDefaultPrompt = buildDefaultSystemPrompt(
					modelId,
					nextDisplayName,
				);
				const currentEffectiveSystemPrompt = getEffectiveModelSettings(
					activeThread,
					modelId,
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
						[modelId]: nextModelOverrides,
					},
				},
				updatedAt: nowIso(),
			};
			updateThreadState(nextThread, !temporaryMode);
		},
		[
			activeThread,
			temporaryMode,
			updateThreadState,
		],
	);
	const updateModelSettings = useCallback(
		(partial: Partial<ChatModelSettings>) => {
			if (!modelSettingsModelId) return;
			updateModelSettingsForModel(modelSettingsModelId, partial);
		},
		[modelSettingsModelId, updateModelSettingsForModel],
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
		<div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
			<Sidebar collapsible="icon" className="border-r border-border bg-background">
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
					onEditTags={handleEditTags}
					onRequestDelete={requestDeleteThread}
					tags={allTags}
					activeTagId={activeVisibleTagId}
					onTagFilterChange={setActiveTagId}
					authUser={authUser}
					authLoading={authLoading}
					onSignOut={handleSignOut}
				/>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="flex h-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
					baseUrl={baseUrl}
					onBaseUrlChange={setBaseUrl}
					onSaveSettings={handleSaveSettings}
					personalization={personalization}
					onPersonalizationChange={setPersonalization}
					onExportChats={handleExportChats}
					isAdmin={isAdmin}
					debugEnabled={debugEnabled}
					onDebugChange={handleDebugChange}
					responseLayout={responseLayout}
					onResponseLayoutChange={handleResponseLayoutChange}
					allowModelCompare
					compareModelIds={
						activeThread?.settings.compareModelIds ?? []
					}
					onCompareModelIdsChange={updateCompareModelIds}
					onSelectedModelOrderChange={updateSelectedModelOrder}
					onRemoveModel={removeSelectedModel}
					onRemoveAllModels={removeAllSelectedModels}
					onOpenModelSettingsForModel={openModelSettingsForModel}
					onUpdateModelSettingsForModel={updateModelSettingsForModel}
					modelDisplayNameById={selectedModelDisplayNameById}
					modelEnabledById={selectedModelEnabledById}
					modelCapabilitiesById={modelCapabilitiesById}
					modelSupportsAudioInputById={modelSupportsAudioInputById}
					requiredCapability={activeModelCapability}
					requireAudioInput={composerRequiresAudioInput}
				/>
				<ChatConversation
					activeThread={activeThread}
					isSending={isSending}
					temporaryMode={temporaryMode}
					mode="unified"
					webSearchEnabled={
						activeThread?.settings.webSearchEnabled ?? false
					}
					onWebSearchEnabledChange={(enabled) =>
						updateActiveSettings({ webSearchEnabled: enabled })
					}
					apiServerToolsEnabled={
						activeThread?.settings.apiServerToolsEnabled ??
						DEFAULT_SETTINGS.apiServerToolsEnabled
					}
					serverTools={
						normalizeServerTools(activeThread?.settings.serverTools)
					}
					onServerToolsChange={(serverTools: ChatServerToolType[]) =>
						updateActiveSettings({
							serverTools: normalizeServerTools(serverTools),
							apiServerToolsEnabled: true,
						})
					}
					serverToolConfigs={
						activeThread?.settings.serverToolConfigs ??
						DEFAULT_SETTINGS.serverToolConfigs
					}
					onServerToolConfigsChange={(
						serverToolConfigs: ChatServerToolConfigs,
					) => updateActiveSettings({ serverToolConfigs })}
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
					modelDisplayNameById={modelDisplayNameById}
					modelOrgIdById={modelOrgIdById}
					modelLinkById={modelLinkById}
					isAuthenticated={isAuthenticated}
					accentColor={personalization.accentColor}
					selectedModelId={activeThread?.modelId ?? ""}
					selectedModelLabel={selectedModelLabel}
					selectedModelCount={selectedModelIds.length}
					selectedModelsHint={selectedModelsHint}
					selectedModelIds={selectedModelIds}
					modelOptions={modelOptions.active}
					onToggleModel={toggleComposerModel}
					onAddModelSet={addComposerModelSet}
					onAudioAttachmentRequirementChange={
						handleAudioAttachmentRequirementChange
					}
					requestError={requestError}
					responseLayout={responseLayout}
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
						? getSupportedProviderIdsForModel(modelSettingsModelId)
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
			<ChatTagsDialog
				key={tagsTarget?.id ?? "chat-tags"}
				open={tagsOpen}
				thread={tagsTarget}
				availableTags={allTags}
				onOpenChange={handleTagsOpenChange}
				onSave={handleTagsSave}
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
		<SidebarProvider defaultOpen contained className="h-full overflow-hidden">
			<ChatPlaygroundContent {...props} />
		</SidebarProvider>
	);
}
