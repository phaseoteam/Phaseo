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
import { getModelDetailsHref } from "@/lib/models/modelHref";
import type {
	ChatMessage,
	ChatModelSettings,
	ChatSettings,
	ChatTag,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";
import {
	clearChatTags,
	deleteChat,
	getAllChatTags,
	getAllChats,
	getChatsPage,
	upsertChat,
	upsertChatTags,
} from "@/lib/indexeddb/chats";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { compareByReleaseDateDesc } from "@/components/(chat)/playgroundConfig";
import {
	ChatConversation,
	type ServerToolModelChoice,
	type ChatSendPayload,
} from "@/components/(chat)/ChatConversation";
import { buildChatServerTools } from "@/components/(chat)/chatServerTools";
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
	supportsAudioInputByCapabilities,
} from "@/components/(chat)/playground/capability-utils";
import {
	APP_HEADERS,
	DEFAULT_SETTINGS,
	STORAGE_KEYS,
	TEMP_CHAT_ID,
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
	isModelExpired,
	normalizeBaseUrl,
	nowIso,
	shouldRequestImageModalities,
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
	modelAliases?: GatewaySupportedModel[];
	modelParam?: string | null;
	promptParam?: string | null;
};

type ChatUser = {
	id: string;
	email: string | null;
	name: string;
	avatarUrl: string | null;
};

const CHAT_PAGE_SIZE = 50;

function limitContextMessages(
	messages: ChatMessage[],
	limit: ChatSettings["contextMessageLimit"],
) {
	if (limit === "all") return messages;
	const numericLimit =
		typeof limit === "number" && Number.isFinite(limit)
			? Math.max(1, Math.floor(limit))
			: DEFAULT_SETTINGS.contextMessageLimit ?? 10;
	if (numericLimit === "all") return messages;
	return messages.slice(-numericLimit);
}

function resolveFusionAnalysisModels(
	models: string[] | undefined,
	fallbackModels: string[],
) {
	return models?.some((modelId) => modelId.trim().length > 0)
		? models
		: fallbackModels;
}

function resolveFusionJudgeModel(
	modelId: string | undefined,
	fallbackModelId: string,
) {
	return modelId?.trim() ? modelId : fallbackModelId;
}

type ChatErrorPayload = Error & {
	code?: string;
	status?: number;
	requestId?: string;
	description?: string;
	details?: Array<{
		message: string;
		path?: string[];
		keyword?: string;
	}>;
	routingDiagnostics?: Record<string, unknown> | null;
	rawPayload?: Record<string, unknown> | null;
};

const resolveGatewayModelOrgId = (model: GatewaySupportedModel) =>
	model.organisationId?.trim() || getOrgId(model.modelId);

function isImageOutputModality(value: string) {
	const normalized = value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
	return normalized.includes("image");
}

function gatewayModelHasImageOutput(model: GatewaySupportedModel) {
	if ((model.outputModalities ?? []).some(isImageOutputModality)) {
		return true;
	}
	return capabilityIdsToUnifiedEndpoints(model.capabilities).includes(
		"images.generations",
	);
}

function compareServerToolModelChoices(
	a: ServerToolModelChoice,
	b: ServerToolModelChoice,
) {
	const releaseDiff =
		Date.parse(b.releaseDate ?? "") - Date.parse(a.releaseDate ?? "");
	if (Number.isFinite(releaseDiff) && releaseDiff !== 0) return releaseDiff;
	const labelDiff = a.label.localeCompare(b.label);
	if (labelDiff !== 0) return labelDiff;
	return a.id.localeCompare(b.id);
}

function buildServerToolModelChoices(
	models: GatewaySupportedModel[],
	filter: (model: GatewaySupportedModel) => boolean,
) {
	const seen = new Set<string>();
	const choices: ServerToolModelChoice[] = [];
	for (const model of models) {
		if (!filter(model)) continue;
		const id = model.selectorModelId;
		if (seen.has(id)) continue;
		seen.add(id);
		const orgId = resolveGatewayModelOrgId(model);
		choices.push({
			id,
			label: model.modelName ?? formatModelLabel(id),
			orgId,
			orgName:
				model.organisationName ??
				model.providerName ??
				formatOrgLabel(orgId),
			releaseDate: model.releaseDate ?? model.announcementDate,
		});
	}
	return choices.sort(compareServerToolModelChoices);
}

function pickPreferredApiModelId(
	current: string | null,
	candidate: string,
	selectorModelId: string,
) {
	if (!current) return candidate;
	if (current === selectorModelId) return current;
	if (candidate === selectorModelId) return candidate;
	if (candidate.length !== current.length) {
		return candidate.length < current.length ? candidate : current;
	}
	return candidate.localeCompare(current) < 0 ? candidate : current;
}

function ChatPlaygroundContent({
	models,
	modelAliases = [],
	modelParam,
	promptParam,
}: ChatPlaygroundProps) {
	const isUnified = true;
	const [threads, setThreads] = useState<ChatThread[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [requestError, setRequestError] =
		useState<ChatRequestErrorDetails | null>(null);
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
	const [tagsOpen, setTagsOpen] = useState(false);
	const [tagsTarget, setTagsTarget] = useState<ChatThread | null>(null);
	const [activeTagId, setActiveTagId] = useState<string | null>(null);
	const [storedTags, setStoredTags] = useState<ChatTag[]>([]);
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
	const [hasMoreThreads, setHasMoreThreads] = useState(false);
	const [isLoadingMoreThreads, setIsLoadingMoreThreads] = useState(false);

	const selectableModels = useMemo(
		() =>
			filterModelsForRoom(models, "text").filter(
				(model) => !isModelExpired(model),
			),
		[models],
	);
	const selectableModelAliases = useMemo(
		() =>
			filterModelsForRoom(modelAliases, "text").filter(
				(model) => !isModelExpired(model),
			),
		[modelAliases],
	);
	const selectorModelIdByRawModelId = useMemo(() => {
		const map = new Map<string, string>();
		for (const model of selectableModels) {
			const selectorModelId = model.selectorModelId;
			map.set(model.modelId, selectorModelId);
			map.set(selectorModelId, selectorModelId);
		}
		return map;
	}, [selectableModels]);
	const preferredRequestModelIdBySelectorModelId = useMemo(() => {
		const map = new Map<string, string>();
		for (const model of selectableModels) {
			const selectorModelId = model.selectorModelId;
			const current = map.get(selectorModelId) ?? null;
			map.set(
				selectorModelId,
				pickPreferredApiModelId(current, model.modelId, selectorModelId),
			);
		}
		return map;
	}, [selectableModels]);
	const requestModelIdBySelectorModelIdByProviderId = useMemo(() => {
		const map = new Map<string, Map<string, string>>();
		for (const model of selectableModels) {
			const selectorModelId = model.selectorModelId;
			const providerMap =
				map.get(selectorModelId) ?? new Map<string, string>();
			const current = providerMap.get(model.providerId) ?? null;
			providerMap.set(
				model.providerId,
				pickPreferredApiModelId(current, model.modelId, selectorModelId),
			);
			map.set(selectorModelId, providerMap);
		}
		return map;
	}, [selectableModels]);
	const availableProviderIdsByModelId = useMemo(() => {
		const providerIdsByModelId = new Map<string, string[]>();
		for (const model of selectableModels) {
			if (!model.isAvailable) continue;
			const selectorModelId = model.selectorModelId;
			const existing = providerIdsByModelId.get(selectorModelId) ?? [];
			if (!existing.includes(model.providerId)) {
				existing.push(model.providerId);
				providerIdsByModelId.set(selectorModelId, existing);
			}
		}
		return providerIdsByModelId;
	}, [selectableModels]);
	const defaultModelId = selectableModels[0]?.selectorModelId ?? "";
	const [lastModelId, setLastModelId] = useState(defaultModelId);
	const queryModelId = (modelParam ?? "").trim();
	const queryPrompt = promptParam ?? "";
	const selectableModelIdSet = useMemo(
		() =>
			new Set(
				selectableModels.map(
					(model) =>
						selectorModelIdByRawModelId.get(model.modelId) ?? model.modelId,
				),
			),
		[selectableModels, selectorModelIdByRawModelId],
	);
	const resolvedQueryModelId = useMemo(
		() => selectorModelIdByRawModelId.get(queryModelId) ?? queryModelId,
		[queryModelId, selectorModelIdByRawModelId],
	);
	const queryModelIsValid = useMemo(() => {
		if (!resolvedQueryModelId) return false;
		return selectableModelIdSet.has(resolvedQueryModelId);
	}, [resolvedQueryModelId, selectableModelIdSet]);
	const [pendingQueryModelId, setPendingQueryModelId] = useState<
		string | null
	>(null);
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
			const selectorModelId = model.selectorModelId;
			const existing = map.get(selectorModelId);
			const orgId = resolveGatewayModelOrgId(model);
			const orgName =
				model.organisationName ??
				model.providerName ??
				formatOrgLabel(orgId);
			const label = model.modelName ?? formatModelLabel(selectorModelId);
			const releaseDate =
				model.releaseDate ?? model.announcementDate ?? null;
			const providerLabel =
				model.providerName ?? formatOrgLabel(model.providerId);
			const rowCapabilityEndpoints = capabilityIdsToUnifiedEndpoints(
				model.capabilities,
			);

			if (!existing) {
				map.set(selectorModelId, {
					modelId: selectorModelId,
					orgId,
					orgName,
					label,
					capabilityEndpoints:
						rowCapabilityEndpoints.length > 0
							? rowCapabilityEndpoints
							: [inferModelCapabilityEndpoint(selectorModelId)],
					inputModalities: [...(model.inputModalities ?? [])],
					outputModalities: [...(model.outputModalities ?? [])],
					supportedReasoningEfforts: [
						...model.supportedReasoningEfforts,
					],
					modelPageNotice: model.modelPageNotice ?? null,
					providerIds: [model.providerId],
					providerNames: [providerLabel],
					providerNameById: { [model.providerId]: providerLabel },
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
				if (!existing.providerNames.includes(providerLabel)) {
					existing.providerNames.push(providerLabel);
				}
				existing.providerNameById[model.providerId] = providerLabel;
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
				for (const modality of model.inputModalities ?? []) {
					if (!existing.inputModalities.includes(modality)) {
						existing.inputModalities.push(modality);
					}
				}
				for (const modality of model.outputModalities ?? []) {
					if (!existing.outputModalities.includes(modality)) {
						existing.outputModalities.push(modality);
					}
				}
				for (const effort of model.supportedReasoningEfforts) {
					if (!existing.supportedReasoningEfforts.includes(effort)) {
						existing.supportedReasoningEfforts.push(effort);
					}
				}
				if (!existing.modelPageNotice && model.modelPageNotice) {
					existing.modelPageNotice = model.modelPageNotice;
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
		const active: ModelOption[] = [];
		const comingSoon: ModelOption[] = [];
		for (const option of options) {
			if (option.gatewayStatus === "inactive") {
				comingSoon.push(option);
			} else {
				active.push(option);
			}
		}
		active.sort(compareByReleaseDateDesc);
		comingSoon.sort(compareByReleaseDateDesc);

		return {
			active,
			comingSoon,
		};
	}, [selectableModels]);
	const serverToolLatestModelChoices = useMemo<ServerToolModelChoice[]>(
		() => {
			const seen = new Set<string>();
			return selectableModelAliases
				.filter((model) => model.isAvailable)
				.map((model) => {
					const orgId = resolveGatewayModelOrgId(model);
					return {
						id: model.selectorModelId,
						label: model.modelName ?? formatModelLabel(model.selectorModelId),
						orgId,
						orgName:
							model.organisationName ??
							model.providerName ??
							formatOrgLabel(orgId),
						releaseDate: model.releaseDate ?? model.announcementDate,
					};
				})
				.filter((choice) => {
					if (seen.has(choice.id)) return false;
					seen.add(choice.id);
					return true;
				});
		},
		[selectableModelAliases],
	);
	const serverToolModelChoices = useMemo<ServerToolModelChoice[]>(
		() => {
			const seen = new Set<string>();
			return modelOptions.active
				.map((option) => ({
					id: option.modelId,
					label: option.label,
					orgId: option.orgId,
					orgName: option.orgName,
					releaseDate: option.releaseDate,
				}))
				.filter((choice) => {
					if (seen.has(choice.id)) return false;
					seen.add(choice.id);
					return true;
				});
		},
		[modelOptions.active],
	);
	const serverToolImageGenerationLatestModelChoices = useMemo<
		ServerToolModelChoice[]
	>(
		() =>
			buildServerToolModelChoices(
				modelAliases,
				(model) =>
					model.isAvailable &&
					!isModelExpired(model) &&
					gatewayModelHasImageOutput(model),
			),
		[modelAliases],
	);
	const serverToolImageGenerationModelChoices = useMemo<
		ServerToolModelChoice[]
	>(
		() =>
			buildServerToolModelChoices(
				models,
				(model) =>
					model.isAvailable &&
					!isModelExpired(model) &&
					gatewayModelHasImageOutput(model),
			),
		[models],
	);
	const defaultFusionAnalysisModels = (() => {
		const used = new Set<string>();
		const defaultChoices =
			serverToolLatestModelChoices.length > 0
				? serverToolLatestModelChoices
				: serverToolModelChoices;
		const pick = (matcher: (choice: ServerToolModelChoice) => boolean) => {
			const match = defaultChoices.find(
				(choice) => !used.has(choice.id) && matcher(choice),
			);
			if (!match) return "";
			used.add(match.id);
			return match.id;
		};
		const defaults = [
			pick((choice) =>
				`${choice.orgId} ${choice.label}`.toLowerCase().includes("anthropic"),
			),
			pick((choice) =>
				`${choice.orgId} ${choice.label}`.toLowerCase().includes("openai"),
			),
			pick((choice) =>
				`${choice.orgId} ${choice.label}`.toLowerCase().includes("google"),
			),
		];
		for (let index = 0; index < defaults.length; index += 1) {
			if (defaults[index]) continue;
			defaults[index] =
				defaultChoices.find((choice) => !used.has(choice.id))?.id ?? "";
			if (defaults[index]) {
				used.add(defaults[index]);
			}
		}
		return defaults;
	})();
	const defaultFusionJudgeModel =
		defaultFusionAnalysisModels.find(Boolean) ?? "";
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
		for (const option of modelOptions.active) {
			setForModel(option.modelId, option.capabilityEndpoints);
		}
		for (const option of modelOptions.comingSoon) {
			setForModel(option.modelId, option.capabilityEndpoints);
		}
		for (const modelId of Object.keys(capabilityById)) {
			if (capabilityById[modelId].length === 0) {
				capabilityById[modelId] = [
					inferModelCapabilityEndpoint(modelId),
				];
			}
		}
		return capabilityById;
	}, [modelOptions.active, modelOptions.comingSoon]);
	const modelSupportedReasoningEffortsById = useMemo(() => {
		const supportedById: Record<
			string,
			Array<NonNullable<ChatSettings["reasoningEffort"]>>
		> = {};
		for (const option of [...modelOptions.active, ...modelOptions.comingSoon]) {
			supportedById[option.modelId] = option.supportedReasoningEfforts;
		}
		return supportedById;
	}, [modelOptions.active, modelOptions.comingSoon]);

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
	const providerNameById = useMemo(
		() =>
			new Map(providerOptions.map((provider) => [provider.id, provider.name])),
		[providerOptions],
	);
	const modelDefaultProviderById = useMemo(() => {
		const map: Record<string, { id: string; name: string }> = {};
		for (const [modelId, providerIds] of availableProviderIdsByModelId.entries()) {
			if (providerIds.length !== 1) continue;
			const providerId = providerIds[0];
			if (!providerId) continue;
			const provider = {
				id: providerId,
				name: providerNameById.get(providerId) ?? formatOrgLabel(providerId),
			};
			map[modelId] = provider;
			for (const model of selectableModels) {
				if (model.selectorModelId !== modelId) continue;
				if (model.modelId?.trim()) {
					map[model.modelId.trim()] = provider;
				}
				if (model.internalModelId?.trim()) {
					map[model.internalModelId.trim()] = provider;
				}
			}
		}
		return map;
	}, [availableProviderIdsByModelId, providerNameById, selectableModels]);
	const getSupportedProviderIdsForModel = useCallback(
		(modelId: string) =>
			availableProviderIdsByModelId.get(
				selectorModelIdByRawModelId.get(modelId) ?? modelId,
			) ?? [],
		[availableProviderIdsByModelId, selectorModelIdByRawModelId],
	);
	const resolveDisplayProviderIdForModel = useCallback(
		(modelId: string, providerId: string | null | undefined) => {
			const normalizedProviderId = providerId?.trim();
			if (normalizedProviderId && normalizedProviderId !== "auto") {
				return normalizedProviderId;
			}
			const supportedProviderIds = getSupportedProviderIdsForModel(modelId);
			return supportedProviderIds.length === 1 ? supportedProviderIds[0] : null;
		},
		[getSupportedProviderIdsForModel],
	);
	const availableModelIdSet = useMemo(
		() =>
			new Set(selectableModels.map((model) => model.selectorModelId)),
		[selectableModels],
	);
	const successorModelIdByPreviousModelId = useMemo(() => {
		const latestByPreviousModelId = new Map<
			string,
			{ modelId: string; timestamp: number }
		>();
		for (const model of selectableModels) {
			if (!model.isAvailable || !model.previousModelId) continue;
			const selectorModelId = model.selectorModelId;
			const parsed = Date.parse(
				model.releaseDate ?? model.announcementDate ?? "",
			);
			const timestamp = Number.isFinite(parsed) ? parsed : 0;
			const existing = latestByPreviousModelId.get(model.previousModelId);
			if (!existing || timestamp >= existing.timestamp) {
				latestByPreviousModelId.set(model.previousModelId, {
					modelId: selectorModelId,
					timestamp,
				});
			}
		}
		return new Map(
			Array.from(latestByPreviousModelId.entries()).map(
				([previousModelId, entry]) => [previousModelId, entry.modelId],
			),
		);
	}, [selectableModels]);
	const isProviderSupportedForModel = useCallback(
		(modelId: string, providerId: string | null | undefined) => {
			if (!providerId || providerId === "auto") return true;
			return getSupportedProviderIdsForModel(modelId).includes(providerId);
		},
		[getSupportedProviderIdsForModel],
	);
	const resolveRequestModelIdForProvider = useCallback(
		(modelId: string, providerId: string | null | undefined) => {
			const selectorModelId =
				selectorModelIdByRawModelId.get(modelId) ?? modelId;
			if (providerId && providerId !== "auto") {
				const providerMap =
					requestModelIdBySelectorModelIdByProviderId.get(selectorModelId);
				const providerSpecificModelId = providerMap?.get(providerId) ?? null;
				if (providerSpecificModelId) {
					return providerSpecificModelId;
				}
			}
			return (
				preferredRequestModelIdBySelectorModelId.get(selectorModelId) ??
				selectorModelId
			);
		},
		[
			preferredRequestModelIdBySelectorModelId,
			requestModelIdBySelectorModelIdByProviderId,
			selectorModelIdByRawModelId,
		],
	);
	const resolveReplacementModelId = useCallback(
		(
			modelId: string,
			options?: { allowDefaultFallback?: boolean },
		): { modelId: string | null; reason: "available" | "successor" | "fallback" | "missing" } => {
			const canonicalModelId =
				selectorModelIdByRawModelId.get(modelId) ?? modelId;
			if (availableModelIdSet.has(canonicalModelId)) {
				return { modelId: canonicalModelId, reason: "available" };
			}
			const successorModelId =
				successorModelIdByPreviousModelId.get(canonicalModelId) ?? null;
			if (successorModelId && availableModelIdSet.has(successorModelId)) {
				return { modelId: successorModelId, reason: "successor" };
			}
			if (options?.allowDefaultFallback && defaultModelId) {
				return { modelId: defaultModelId, reason: "fallback" };
			}
			return { modelId: null, reason: "missing" };
		},
		[
			availableModelIdSet,
			defaultModelId,
			selectorModelIdByRawModelId,
			successorModelIdByPreviousModelId,
		],
	);

	const isAuthenticated = Boolean(authUser);
	const isAdmin = userRole === "admin";
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

	const downloadChats = useCallback((chats: ChatThread[], prefix: string) => {
		const payload = {
			version: 1,
			exportedAt: new Date().toISOString(),
			room: "text",
			chats,
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${prefix}-${Date.now()}.json`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}, []);

	const handleExportChats = useCallback(async () => {
		const chats = await getAllChats("text");
		downloadChats(chats, "ai-stats-chats");
	}, [downloadChats]);

	const handleExportCurrentChat = useCallback(() => {
		const thread =
			temporaryMode && temporaryThread
				? temporaryThread
				: threads.find((candidate) => candidate.id === activeId) ?? null;
		if (!thread) return;
		downloadChats([thread], "ai-stats-chat");
	}, [activeId, downloadChats, temporaryMode, temporaryThread, threads]);

	const handleExportThreads = useCallback(
		(chats: ChatThread[]) => {
			if (chats.length === 0) return;
			downloadChats(chats, "ai-stats-selected-chats");
		},
		[downloadChats],
	);

	const normalizeImportedChat = useCallback((value: unknown): ChatThread | null => {
		if (!value || typeof value !== "object") return null;
		const chat = value as Partial<ChatThread>;
		if (
			typeof chat.id !== "string" ||
			typeof chat.title !== "string" ||
			typeof chat.modelId !== "string" ||
			typeof chat.createdAt !== "string" ||
			typeof chat.updatedAt !== "string" ||
			!Array.isArray(chat.messages) ||
			!chat.settings ||
			typeof chat.settings !== "object"
		) {
			return null;
		}
		const tags = Array.isArray(chat.tags)
			? chat.tags
					.filter(
						(tag): tag is ChatTag =>
							Boolean(tag) &&
							typeof tag === "object" &&
							typeof tag.id === "string" &&
							typeof tag.name === "string" &&
							typeof tag.color === "string",
					)
					.map((tag) => ({
						id: tag.id,
						name: tag.name,
						color: tag.color,
					}))
			: undefined;

		return {
			id: chat.id,
			title: chat.title,
			titleLocked: Boolean(chat.titleLocked),
			pinned: Boolean(chat.pinned),
			tags,
			modelId: chat.modelId,
			createdAt: chat.createdAt,
			updatedAt: chat.updatedAt,
			messages: chat.messages,
			settings: chat.settings,
		};
	}, []);

	const handleImportChats = useCallback(
		async (file: File): Promise<{ message: string; type: "success" | "error" | "info" }> => {
			try {
				const text = await file.text();
				const data = JSON.parse(text) as Record<string, unknown>;
				const rawChats = Array.isArray(data.chats)
					? data.chats
					: data.chat
						? [data.chat]
						: [];
				if (rawChats.length === 0) {
					return {
						message: "No chats found in that JSON file.",
						type: "info",
					};
				}

				const importedChats = rawChats
					.map(normalizeImportedChat)
					.filter((chat): chat is ChatThread => Boolean(chat));
				if (importedChats.length === 0) {
					return {
						message: "No valid chats could be imported from that file.",
						type: "error",
					};
				}

				await Promise.all(importedChats.map((chat) => upsertChat(chat, "text")));
				const importedTags = importedChats.flatMap((chat) => chat.tags ?? []);
				if (importedTags.length > 0) {
					await upsertChatTags(importedTags);
					setStoredTags((prev) => {
						const byId = new Map(prev.map((tag) => [tag.id, tag]));
						for (const tag of importedTags) {
							byId.set(tag.id, tag);
						}
						return [...byId.values()].sort((a, b) =>
							a.name.localeCompare(b.name),
						);
					});
				}
				setThreads((prev) => {
					const byId = new Map(prev.map((thread) => [thread.id, thread]));
					for (const chat of importedChats) {
						byId.set(chat.id, chat);
					}
					return [...byId.values()].sort((a, b) =>
						b.updatedAt.localeCompare(a.updatedAt),
					);
				});
				if (!activeId && importedChats[0]) {
					setActiveId(importedChats[0].id);
				}
				return {
					message: `Imported ${importedChats.length} chat${importedChats.length === 1 ? "" : "s"}.`,
					type: "success",
				};
			} catch (error) {
				return {
					message: `Import failed: ${error instanceof Error ? error.message : "Invalid JSON file"}`,
					type: "error",
				};
			}
		},
		[activeId, normalizeImportedChat],
	);

	const handleDeleteAllChats = useCallback(async () => {
		const chats = await getAllChats("text");
		await Promise.all([
			...chats.map((chat) => deleteChat(chat.id, "text")),
			clearChatTags(),
		]);
		setThreads([]);
		setStoredTags([]);
		setActiveId(null);
		setActiveTagId(null);
		setHasMoreThreads(false);
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(STORAGE_KEYS.activeChatId);
		}
	}, []);

	const handleDeleteThreads = useCallback(
		async (targetThreads: ChatThread[]) => {
			if (targetThreads.length === 0) return;
			const label =
				targetThreads.length === 1
					? "this chat"
					: `${targetThreads.length} chats`;
			if (
				typeof window !== "undefined" &&
				!window.confirm(`Delete ${label}? This cannot be undone.`)
			) {
				return;
			}
			const targetIds = new Set(
				targetThreads.map((thread) => thread.id),
			);
			await Promise.all(
				targetThreads.map((thread) => deleteChat(thread.id, "text")),
			);
			setThreads((prev) =>
				prev.filter((thread) => !targetIds.has(thread.id)),
			);
			if (activeId && targetIds.has(activeId)) {
				const remaining = threads.filter(
					(thread) => !targetIds.has(thread.id),
				);
				setActiveId(remaining[0]?.id ?? null);
			}
		},
		[activeId, threads],
	);

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
			const orgId = resolveGatewayModelOrgId(model);
			if (!map[orgId]) {
				map[orgId] =
					model.organisationName ??
					model.providerName ??
					formatOrgLabel(orgId);
			}
		}
		return map;
	}, [selectableModels]);

	const modelDisplayNameById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const model of models) {
			const modelId = model.selectorModelId.trim();
			if (!modelId || map[modelId]) continue;
			const fallbackLabel = formatModelLabel(modelId);
			map[modelId] = model.modelName?.trim() || fallbackLabel;
		}
		return map;
	}, [models]);

	const modelOrgIdById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const model of models) {
			const modelId = model.selectorModelId.trim();
			if (!modelId || map[modelId]) continue;
			map[modelId] = resolveGatewayModelOrgId(model);
		}
		return map;
	}, [models]);

	const modelLinkById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const model of models) {
			const selectorModelId = model.selectorModelId.trim();
			if (!selectorModelId || map[selectorModelId]) continue;
			const orgId = resolveGatewayModelOrgId(model);
			const routeModelId =
				model.internalModelId?.trim() ||
				selectorModelId.replace(/:free$/i, "");
			const href = getModelDetailsHref(orgId, routeModelId);
			if (!href) continue;
			map[selectorModelId] = href;
		}
		return map;
	}, [models]);

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
			supportById[model.selectorModelId] = fromCapabilities || fromModelId;
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
		if (!activeThread?.modelId) return null;
		return "responses" as UnifiedChatEndpoint;
	}, [activeThread?.modelId]);

	const sortedThreads = useMemo(() => {
		return [...threads].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}, [threads]);

	const allTags = useMemo(() => {
		const byId = new Map<string, ChatTag>();
		for (const tag of storedTags) {
			byId.set(tag.id, tag);
		}
		for (const thread of threads) {
			for (const tag of thread.tags ?? []) {
				if (!byId.has(tag.id)) {
					byId.set(tag.id, tag);
				}
			}
		}
		return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [storedTags, threads]);

	const activeVisibleTagId =
		activeTagId && allTags.some((tag) => tag.id === activeTagId)
			? activeTagId
			: null;

	const visibleThreads = useMemo(() => {
		if (!activeVisibleTagId) return sortedThreads;
		return sortedThreads.filter((thread) =>
			thread.tags?.some((tag) => tag.id === activeVisibleTagId),
		);
	}, [activeVisibleTagId, sortedThreads]);

	const groupedThreads = useMemo(() => {
		const groups: GroupedThreads = {
			pinned: [],
			today: [],
			yesterday: [],
			week: [],
			month: [],
			older: [],
		};

		const fallbackAnchorMs = Date.parse(visibleThreads[0]?.updatedAt ?? "");
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

		for (const thread of visibleThreads) {
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
	}, [groupingNowMs, visibleThreads]);

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

	// react-doctor-disable-next-line
	useEffect(() => {
		let mounted = true;
		(async () => {
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
			const resolvedStoredModelId = storedModel
				? (selectorModelIdByRawModelId.get(storedModel) ?? storedModel)
				: null;
			const resolvedModel =
				(queryModelIsValid && resolvedQueryModelId) ||
				(resolvedStoredModelId &&
					selectableModelIdSet.has(resolvedStoredModelId) &&
					resolvedStoredModelId) ||
				defaultModelId;
			if (!mounted) return;
			window.localStorage.removeItem(STORAGE_KEYS.apiKey);
			setBaseUrl(storedBase);
			setLastModelId(resolvedModel);
			setPersonalization({
				name: storedPersonalName,
				role: storedPersonalRole,
				notes: storedPersonalNotes,
				accentColor: storedAccent,
			});

			const [page, savedTags] = await Promise.all([
				getChatsPage("text", { limit: CHAT_PAGE_SIZE }),
				getAllChatTags(),
			]);
			const normalized = await ensureInitialThread(page.chats);
			if (!mounted) return;
			setThreads(normalized);
			setHasMoreThreads(page.hasMore);
			const embeddedTags = normalized.flatMap((chat) => chat.tags ?? []);
			const mergedTagsById = new Map<string, ChatTag>();
			for (const tag of [...savedTags, ...embeddedTags]) {
				mergedTagsById.set(tag.id, tag);
			}
			const mergedTags = [...mergedTagsById.values()].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			setStoredTags(mergedTags);
			void upsertChatTags(mergedTags);

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
		resolvedQueryModelId,
		queryModelIsValid,
		selectableModelIdSet,
		selectorModelIdByRawModelId,
	]);

	// react-doctor-disable-next-line
	useEffect(() => {
		if (!activeThread?.modelId) return;
		// react-doctor-disable-next-line
		setLastModelId(activeThread.modelId);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(
				STORAGE_KEYS.lastModelId,
				activeThread.modelId,
			);
		}
	}, [activeThread?.modelId]);
	useEffect(() => {
		// react-doctor-disable-next-line
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
			// react-doctor-disable-next-line
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
	}, [activeThread, createThreadWithSettings]);

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
					const resolvedProviderId =
						message.providerId ?? thread.settings.providerId;
					const concreteProviderId =
						resolvedProviderId && resolvedProviderId !== "auto"
							? resolvedProviderId
							: null;
					return {
						...message,
						modelId: message.modelId ?? thread.modelId,
						providerId: resolvedProviderId,
						providerName:
							concreteProviderId
								? (message.providerName ??
									providerNameById.get(concreteProviderId) ??
									formatOrgLabel(concreteProviderId))
								: null,
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
		[applyMessageUpdate, providerNameById],
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
				const resolvedProviderId =
					providerId && providerId !== "auto"
						? providerId
						: message.providerId ?? thread.settings.providerId;
				const concreteProviderId =
					resolvedProviderId && resolvedProviderId !== "auto"
						? resolvedProviderId
						: null;
				return {
					...message,
					modelId: message.modelId ?? thread.modelId,
					providerId: resolvedProviderId,
					providerName:
						concreteProviderId
							? (providerNameById.get(concreteProviderId) ??
								message.providerName ??
								formatOrgLabel(concreteProviderId))
							: null,
					content: activeVariant?.content ?? message.content,
					variants,
					activeVariantIndex: activeIndex,
					usage: activeVariant?.usage ?? message.usage ?? null,
					meta: activeVariant?.meta ?? message.meta ?? null,
				};
			});
		},
		[applyMessageUpdate, providerNameById],
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
			const limitedContextMessages = limitContextMessages(
				contextMessages,
				thread.settings.contextMessageLimit,
			);
			if (mergedSystemPrompt) {
				payloadMessages.push({
					role: "system",
					content: mergedSystemPrompt,
				});
			}
			payloadMessages.push(
				...limitedContextMessages.map((msg) => ({
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
			const initialDisplayProviderId = resolveDisplayProviderIdForModel(
				selectedModelId,
				effectiveProviderId,
			);
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
			if (endpoint === "responses") {
				requestBody.input = input;
				requestBody.meta = true;
				requestBody.stream = streamEnabled;
				if (wantsImageModalities) {
					requestBody.modalities = ["text", "image"];
				}
				const tools = isUnified
					? buildChatServerTools({
							webSearchEnabled:
								sendPayload?.webSearchEnabled ??
								effectiveModelSettings.webSearchEnabled,
							serverToolWebSearchEngine:
								sendPayload?.serverToolWebSearchEngine ??
								effectiveModelSettings.serverToolWebSearchEngine,
							serverToolWebSearchContextSize:
								sendPayload?.serverToolWebSearchContextSize ??
								effectiveModelSettings.serverToolWebSearchContextSize,
							serverToolWebSearchMaxResults:
								sendPayload?.serverToolWebSearchMaxResults ??
								effectiveModelSettings.serverToolWebSearchMaxResults,
							serverToolWebSearchMaxTotalResults:
								sendPayload?.serverToolWebSearchMaxTotalResults ??
								effectiveModelSettings.serverToolWebSearchMaxTotalResults,
							serverToolWebSearchMaxCharacters:
								sendPayload?.serverToolWebSearchMaxCharacters ??
								effectiveModelSettings.serverToolWebSearchMaxCharacters,
							serverToolWebSearchAllowedDomains:
								sendPayload?.serverToolWebSearchAllowedDomains ??
								effectiveModelSettings.serverToolWebSearchAllowedDomains,
							serverToolWebSearchBlockedDomains:
								sendPayload?.serverToolWebSearchBlockedDomains ??
								effectiveModelSettings.serverToolWebSearchBlockedDomains,
							apiServerToolsEnabled:
								sendPayload?.apiServerToolsEnabled ??
								effectiveModelSettings.apiServerToolsEnabled,
							serverToolTimezone:
								sendPayload?.serverToolTimezone ??
								effectiveModelSettings.serverToolTimezone,
							serverToolWebFetchEnabled:
								sendPayload?.serverToolWebFetchEnabled ??
								effectiveModelSettings.serverToolWebFetchEnabled,
							serverToolWebFetchEngine:
								sendPayload?.serverToolWebFetchEngine ??
								effectiveModelSettings.serverToolWebFetchEngine,
							serverToolWebFetchMaxContentTokens:
								sendPayload?.serverToolWebFetchMaxContentTokens ??
								effectiveModelSettings.serverToolWebFetchMaxContentTokens,
							serverToolWebFetchAllowedDomains:
								sendPayload?.serverToolWebFetchAllowedDomains ??
								effectiveModelSettings.serverToolWebFetchAllowedDomains,
							serverToolWebFetchBlockedDomains:
								sendPayload?.serverToolWebFetchBlockedDomains ??
								effectiveModelSettings.serverToolWebFetchBlockedDomains,
							serverToolAdvisorEnabled:
								sendPayload?.serverToolAdvisorEnabled ??
								effectiveModelSettings.serverToolAdvisorEnabled,
							serverToolAdvisors:
								sendPayload?.serverToolAdvisors ??
								effectiveModelSettings.serverToolAdvisors,
							serverToolImageGenerationEnabled:
								sendPayload?.serverToolImageGenerationEnabled ??
								effectiveModelSettings.serverToolImageGenerationEnabled,
							serverToolImageGenerationModel:
								sendPayload?.serverToolImageGenerationModel ??
								effectiveModelSettings.serverToolImageGenerationModel,
							serverToolImageGenerationQuality:
								sendPayload?.serverToolImageGenerationQuality ??
								effectiveModelSettings.serverToolImageGenerationQuality,
							serverToolImageGenerationAspectRatio:
								sendPayload?.serverToolImageGenerationAspectRatio ??
								effectiveModelSettings.serverToolImageGenerationAspectRatio,
							serverToolImageGenerationSize:
								sendPayload?.serverToolImageGenerationSize ??
								effectiveModelSettings.serverToolImageGenerationSize,
							serverToolImageGenerationBackground:
								sendPayload?.serverToolImageGenerationBackground ??
								effectiveModelSettings.serverToolImageGenerationBackground,
							serverToolImageGenerationOutputFormat:
								sendPayload?.serverToolImageGenerationOutputFormat ??
								effectiveModelSettings.serverToolImageGenerationOutputFormat,
							serverToolImageGenerationOutputCompression:
								sendPayload?.serverToolImageGenerationOutputCompression ??
								effectiveModelSettings.serverToolImageGenerationOutputCompression,
							serverToolImageGenerationModeration:
								sendPayload?.serverToolImageGenerationModeration ??
								effectiveModelSettings.serverToolImageGenerationModeration,
							serverToolSubagentEnabled:
								sendPayload?.serverToolSubagentEnabled ??
								effectiveModelSettings.serverToolSubagentEnabled,
							serverToolSubagentModel:
								sendPayload?.serverToolSubagentModel ??
								effectiveModelSettings.serverToolSubagentModel,
							serverToolSubagentInstructions:
								sendPayload?.serverToolSubagentInstructions ??
								effectiveModelSettings.serverToolSubagentInstructions,
							serverToolSubagentMaxUses:
								sendPayload?.serverToolSubagentMaxUses ??
								effectiveModelSettings.serverToolSubagentMaxUses,
							serverToolFusionEnabled:
								sendPayload?.serverToolFusionEnabled ??
								effectiveModelSettings.serverToolFusionEnabled,
							serverToolFusionAnalysisModels: resolveFusionAnalysisModels(
								sendPayload?.serverToolFusionAnalysisModels ??
									effectiveModelSettings.serverToolFusionAnalysisModels,
								defaultFusionAnalysisModels,
							),
							serverToolFusionJudgeModel: resolveFusionJudgeModel(
								sendPayload?.serverToolFusionJudgeModel ??
									effectiveModelSettings.serverToolFusionJudgeModel,
								defaultFusionJudgeModel,
							),
							serverToolFusionMaxUses:
								sendPayload?.serverToolFusionMaxUses ??
								effectiveModelSettings.serverToolFusionMaxUses,
						})
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

			const requestStartedAt = performance.now();
			let firstTokenAt: number | null = null;
			let finalUsage: Record<string, unknown> | null = null;
			let finalMeta: Record<string, unknown> | null = null;
			let finalProviderId: string | null = initialDisplayProviderId;
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
				const toProviderId = (value: unknown): string | null =>
					typeof value === "string" && value.trim().length > 0
						? value.trim()
						: null;
				const readRoutingProviderId = (value: unknown): string | null => {
					if (!value || typeof value !== "object" || Array.isArray(value)) {
						return null;
					}
					const routing = value as Record<string, unknown>;
					return (
						toProviderId(routing.selected_provider) ??
						toProviderId(routing.selectedProvider) ??
						toProviderId(routing.provider) ??
						toProviderId(routing.provider_id)
					);
				};
				for (const candidate of [
					payload?.provider,
					payload?.provider_id,
					payload?.providerId,
					payload?.selected_provider,
					payload?.selectedProvider,
					payload?.response?.provider,
					payload?.response?.provider_id,
					payload?.response?.providerId,
					payload?.response?.selected_provider,
					payload?.response?.selectedProvider,
				]) {
					const providerId = toProviderId(candidate);
					if (providerId) return providerId;
				}
				return (
					readRoutingProviderId(payload?.routing) ??
					readRoutingProviderId(payload?.response?.routing) ??
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
					const createdAt = nowIso();
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "Generating...",
						createdAt,
						modelId: selectedModelId,
						providerId: initialDisplayProviderId ?? effectiveProviderId,
						providerName:
							(initialDisplayProviderId
								? providerNameById.get(initialDisplayProviderId)
								: null) ??
							(initialDisplayProviderId
								? formatOrgLabel(initialDisplayProviderId)
								: null),
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
					let errorRequestId: string | undefined;
					let errorDescription: string | undefined;
					let errorDetails:
						| Array<{
							message: string;
							path?: string[];
							keyword?: string;
						}>
						| undefined;
					let routingDiagnostics:
						| Record<string, unknown>
						| null
						| undefined;
					let rawPayload: Record<string, unknown> | undefined;
					if (contentType.includes("application/json")) {
						try {
							const payload = (await response.json()) as
								| Record<string, unknown>
								| null;
							if (payload) {
								rawPayload = payload;
								if (typeof payload.message === "string") {
									errorMessage = payload.message;
								} else if (
									typeof payload.description === "string"
								) {
									errorMessage = payload.description;
								} else if (
									typeof payload.error === "string"
								) {
									errorMessage = payload.error;
								}
								if (typeof payload.error === "string") {
									errorCode = payload.error;
								}
								if (
									typeof payload.request_id === "string"
								) {
									errorRequestId = payload.request_id;
								}
								if (
									typeof payload.description === "string"
								) {
									errorDescription = payload.description;
								}
								if (Array.isArray(payload.details)) {
									errorDetails = payload.details.flatMap((detail) => {
											if (
												!detail ||
												typeof detail !== "object"
											) {
												return [];
											}
											const message =
												typeof (
													detail as {
														message?: unknown;
													}
												).message === "string"
													? String(
															(detail as {
																message: string;
															}).message,
														)
													: null;
											if (!message) return [];
											return [{
												message,
												path: Array.isArray(
													(detail as {
														path?: unknown;
													}).path,
												)
													? (
															detail as {
																path: unknown[];
															}
														).path
															.map((entry) =>
																typeof entry ===
																"string"
																	? entry
																	: null,
															)
															.filter(
																(
																	entry,
																): entry is string =>
																	Boolean(entry),
															)
													: undefined,
												keyword:
													typeof (
														detail as {
															keyword?: unknown;
														}
													).keyword === "string"
														? String(
																(detail as {
																	keyword: string;
																}).keyword,
															)
														: undefined,
											}];
										});
								}
								if (
									payload.routing_diagnostics &&
									typeof payload.routing_diagnostics ===
										"object" &&
									!Array.isArray(payload.routing_diagnostics)
								) {
									routingDiagnostics =
										payload.routing_diagnostics as Record<
											string,
											unknown
										>;
								}
							}
						} catch {
							// ignore malformed JSON payloads
						}
					} else {
						const text = await response.text();
						if (text) errorMessage = text;
					}
					const requestError: ChatErrorPayload = Object.assign(
						new Error(errorMessage),
						{
							code: errorCode,
							status: response.status,
							requestId: errorRequestId,
							description: errorDescription,
							details: errorDetails,
							routingDiagnostics: routingDiagnostics ?? null,
							rawPayload,
						},
					);
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
						assistantContent = `[Open result](${objectUrl})`;
					}

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
						const totalCostUsd = extractTotalCostUsd(finalUsage);
						if (totalCostUsd) {
							mergedMeta.total_cost_usd = totalCostUsd;
						}
						assistantContent = appendImagesToText(reply, images);
						if (!assistantContent) {
							assistantContent = "Request completed.";
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
								finalProviderId,
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
							finalProviderId,
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
					const assistantMessage: ChatMessage = {
						id: assistantId,
						role: "assistant",
						content: "",
						createdAt: nowIso(),
						modelId: selectedModelId,
						providerId: initialDisplayProviderId ?? effectiveProviderId,
						providerName:
							(initialDisplayProviderId
								? providerNameById.get(initialDisplayProviderId)
								: null) ??
							(initialDisplayProviderId
								? formatOrgLabel(initialDisplayProviderId)
								: null),
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
								finalProviderId =
									resolvePayloadProviderId(parsed) ??
									finalProviderId;
								let responseText = "";
								let delta = "";
								let reasoningDelta = "";
								let reasoningUpdated = false;
								let summaryUpdated = false;
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
					finalProviderId,
				);

				await updateThreadState(latestThread, !temporaryMode);
			} catch (err) {
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
					providerId: finalProviderId ?? initialDisplayProviderId,
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
							finalProviderId ?? initialDisplayProviderId,
						);
					} else {
						const errorMessage: ChatMessage = {
							id: generateId(),
							role: "assistant",
							content: message,
							createdAt: nowIso(),
							modelId: selectedModelId,
							providerId:
								finalProviderId ??
								initialDisplayProviderId ??
								latestThread.settings.providerId,
							providerName:
								(finalProviderId ?? initialDisplayProviderId
									? providerNameById.get(
											finalProviderId ?? initialDisplayProviderId ?? "",
										)
									: null) ??
								(finalProviderId ?? initialDisplayProviderId
									? formatOrgLabel(
											finalProviderId ?? initialDisplayProviderId ?? "",
										)
									: null),
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
			}
		},
		[
			baseUrl,
			defaultFusionAnalysisModels,
			defaultFusionJudgeModel,
			isUnified,
			personalization,
			shouldDebug,
			appendAssistantVariant,
			getPrimaryCapabilityForModel,
			isProviderSupportedForModel,
			providerNameById,
			resolveDisplayProviderIdForModel,
			resolveRequestModelIdForProvider,
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
			getPrimaryCapabilityForModel,
			isModelCapabilityCompatible,
			temporaryMode,
			updateThreadState,
		],
	);

	const updateActiveModel = useCallback(
		(modelId: string) => {
			if (!activeThread) return;
			setPendingQueryModelId(null);
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
			setLastModelId(modelId);
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
		setPendingQueryModelId(queryModelIsValid ? resolvedQueryModelId : null);
	}, [queryModelIsValid, resolvedQueryModelId]);
	useEffect(() => {
		if (!queryModelIsValid || !resolvedQueryModelId || !activeThread) return;
		if (!pendingQueryModelId) return;
		if (activeThread.modelId !== pendingQueryModelId) {
			updateActiveModel(pendingQueryModelId);
		}
		// react-doctor-disable-next-line
		setPendingQueryModelId(null);
	}, [
		activeThread,
		pendingQueryModelId,
		queryModelIsValid,
		resolvedQueryModelId,
		updateActiveModel,
	]);
	useEffect(() => {
		if (!activeThread?.modelId) return;
		const effectiveSettings = getEffectiveModelSettings(
			activeThread,
			activeThread.modelId,
		);
		if (
			isProviderSupportedForModel(
				activeThread.modelId,
				effectiveSettings.providerId,
			)
		) {
			return;
		}
		const currentOverrides = activeThread.settings.modelOverridesById ?? {};
		const existingModelOverrides =
			currentOverrides[activeThread.modelId] ?? {};
		const nextThread: ChatThread = {
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
		void updateThreadState(nextThread, !temporaryMode);
	}, [
		activeThread,
		isProviderSupportedForModel,
		temporaryMode,
		updateThreadState,
	]);
	useEffect(() => {
		if (!activeThread?.modelId) return;
		const compareIds = activeThread.settings.compareModelIds ?? [];
		if (!compareIds.length) return;
		const requiredCapability: UnifiedChatEndpoint = "responses";
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
		isModelSelectableForContext,
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
		// react-doctor-disable-next-line
		setError(
			"Audio is attached. Select a model that supports audio input to continue.",
		);
		// react-doctor-disable-next-line
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
		if (tags.length > 0) {
			await upsertChatTags(tags);
			setStoredTags((prev) => {
				const byId = new Map(prev.map((tag) => [tag.id, tag]));
				for (const tag of tags) {
					byId.set(tag.id, tag);
				}
				return [...byId.values()].sort((a, b) =>
					a.name.localeCompare(b.name),
				);
			});
		}
		await updateStoredThread({
			...thread,
			tags,
			updatedAt: nowIso(),
		});
		setTagsOpen(false);
		setTagsTarget(null);
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
			const model = models.find(
				(entry) =>
					entry.selectorModelId === modelId || entry.modelId === modelId,
			);
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
	const selectedSupportedReasoningEfforts = useMemo(() => {
		const selectedEnabledIds = selectedModelIds.filter(
			(modelId) => selectedModelEnabledById[modelId] !== false,
		);
		if (selectedEnabledIds.length === 0) {
			return ["none"] satisfies Array<
				NonNullable<ChatSettings["reasoningEffort"]>
			>;
		}
		const supportedSets = selectedEnabledIds.map((modelId) => {
			const supported =
				modelSupportedReasoningEffortsById[modelId] ??
				modelSupportedReasoningEffortsById[
					selectorModelIdByRawModelId.get(modelId) ?? modelId
				] ??
				[];
			return new Set<NonNullable<ChatSettings["reasoningEffort"]>>([
				"none",
				...supported,
			]);
		});
		const [firstSet, ...remainingSets] = supportedSets;
		if (!firstSet) {
			return ["none"] satisfies Array<
				NonNullable<ChatSettings["reasoningEffort"]>
			>;
		}
		return Array.from(firstSet).filter((effort) =>
			remainingSets.every((set) => set.has(effort)),
		);
	}, [
		modelSupportedReasoningEffortsById,
		selectedModelEnabledById,
		selectedModelIds,
		selectorModelIdByRawModelId,
	]);

	const loadMoreThreads = useCallback(async () => {
		if (isLoadingMoreThreads || !hasMoreThreads) return;
		setIsLoadingMoreThreads(true);
		try {
			const page = await getChatsPage("text", {
				limit: CHAT_PAGE_SIZE,
				offset: threads.length,
			});
			setThreads((prev) => {
				const byId = new Map(prev.map((thread) => [thread.id, thread]));
				for (const thread of page.chats) {
					byId.set(thread.id, thread);
				}
				return [...byId.values()].sort((a, b) =>
					b.updatedAt.localeCompare(a.updatedAt),
				);
			});
			setHasMoreThreads(page.hasMore);
		} finally {
			setIsLoadingMoreThreads(false);
		}
	}, [hasMoreThreads, isLoadingMoreThreads, threads.length]);
	const modelSettingsChoices = useMemo(
		() => {
			const requiredCapability = activeModelCapability;
			const requiresAudioInput = composerRequiresAudioInput;
			const byId = new Map<
				string,
				{ id: string; label: string; orgId: string; orgName: string }
			>();
			for (const model of selectableModels) {
				const selectorModelId = model.selectorModelId;
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
				const orgId = resolveGatewayModelOrgId(model);
				const orgName =
					model.organisationName ??
					model.providerName ??
					formatOrgLabel(orgId);
				// Keep selector labels canonical; nicknames are display-only in chat UI.
				const baseLabel =
					model.modelName || formatModelLabel(selectorModelId);
				const isDisabled =
					activeThread?.settings.modelOverridesById?.[
						selectorModelId
					]?.enabled === false;
				byId.set(selectorModelId, {
					id: selectorModelId,
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
			serverToolWebSearchEngine: DEFAULT_SETTINGS.serverToolWebSearchEngine,
			serverToolWebSearchContextSize:
				DEFAULT_SETTINGS.serverToolWebSearchContextSize,
			serverToolWebSearchMaxResults:
				DEFAULT_SETTINGS.serverToolWebSearchMaxResults,
			serverToolWebSearchMaxTotalResults:
				DEFAULT_SETTINGS.serverToolWebSearchMaxTotalResults,
			serverToolWebSearchMaxCharacters:
				DEFAULT_SETTINGS.serverToolWebSearchMaxCharacters,
			serverToolWebSearchAllowedDomains:
				DEFAULT_SETTINGS.serverToolWebSearchAllowedDomains,
			serverToolWebSearchBlockedDomains:
				DEFAULT_SETTINGS.serverToolWebSearchBlockedDomains,
			apiServerToolsEnabled: DEFAULT_SETTINGS.apiServerToolsEnabled,
			serverToolTimezone: DEFAULT_SETTINGS.serverToolTimezone,
			serverToolWebFetchEnabled: DEFAULT_SETTINGS.serverToolWebFetchEnabled,
			serverToolWebFetchEngine: DEFAULT_SETTINGS.serverToolWebFetchEngine,
			serverToolWebFetchMaxContentTokens:
				DEFAULT_SETTINGS.serverToolWebFetchMaxContentTokens,
			serverToolWebFetchAllowedDomains:
				DEFAULT_SETTINGS.serverToolWebFetchAllowedDomains,
			serverToolWebFetchBlockedDomains:
				DEFAULT_SETTINGS.serverToolWebFetchBlockedDomains,
			serverToolAdvisorEnabled: DEFAULT_SETTINGS.serverToolAdvisorEnabled,
			serverToolAdvisors: DEFAULT_SETTINGS.serverToolAdvisors,
			serverToolImageGenerationEnabled:
				DEFAULT_SETTINGS.serverToolImageGenerationEnabled,
			serverToolImageGenerationModel:
				DEFAULT_SETTINGS.serverToolImageGenerationModel,
			serverToolImageGenerationQuality:
				DEFAULT_SETTINGS.serverToolImageGenerationQuality,
			serverToolImageGenerationAspectRatio:
				DEFAULT_SETTINGS.serverToolImageGenerationAspectRatio,
			serverToolImageGenerationSize:
				DEFAULT_SETTINGS.serverToolImageGenerationSize,
			serverToolImageGenerationBackground:
				DEFAULT_SETTINGS.serverToolImageGenerationBackground,
			serverToolImageGenerationOutputFormat:
				DEFAULT_SETTINGS.serverToolImageGenerationOutputFormat,
			serverToolImageGenerationOutputCompression:
				DEFAULT_SETTINGS.serverToolImageGenerationOutputCompression,
			serverToolImageGenerationModeration:
				DEFAULT_SETTINGS.serverToolImageGenerationModeration,
			serverToolSubagentEnabled: DEFAULT_SETTINGS.serverToolSubagentEnabled,
			serverToolSubagentModel: DEFAULT_SETTINGS.serverToolSubagentModel,
			serverToolSubagentInstructions:
				DEFAULT_SETTINGS.serverToolSubagentInstructions,
			serverToolSubagentMaxUses: DEFAULT_SETTINGS.serverToolSubagentMaxUses,
			serverToolFusionEnabled: DEFAULT_SETTINGS.serverToolFusionEnabled,
			serverToolFusionAnalysisModels:
				DEFAULT_SETTINGS.serverToolFusionAnalysisModels,
			serverToolFusionJudgeModel: DEFAULT_SETTINGS.serverToolFusionJudgeModel,
			serverToolFusionMaxUses: DEFAULT_SETTINGS.serverToolFusionMaxUses,
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
		<div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
			<Sidebar collapsible="icon" className="border-r border-border bg-background">
				<ChatSidebar
					groupedThreads={groupedThreads}
					threads={visibleThreads}
					activeId={activeId}
					temporaryMode={temporaryMode}
					onCreateThread={createThread}
					onSearch={() => setSearchOpen(true)}
					onSelectThread={setActiveThread}
					onRenameThread={handleRename}
					onPinToggle={handlePinToggle}
					onEditTags={handleEditTags}
					onRequestDelete={requestDeleteThread}
					onExportThreads={handleExportThreads}
					onDeleteThreads={handleDeleteThreads}
					tags={allTags}
					activeTagId={activeVisibleTagId}
					onTagFilterChange={setActiveTagId}
					hasMoreThreads={hasMoreThreads}
					isLoadingMoreThreads={isLoadingMoreThreads}
					onLoadMoreThreads={loadMoreThreads}
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
					onExportCurrentChat={handleExportCurrentChat}
					onImportChats={handleImportChats}
					onDeleteAllChats={handleDeleteAllChats}
					isAdmin={isAdmin}
					debugEnabled={debugEnabled}
					onDebugChange={handleDebugChange}
					allowModelCompare
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
				<ChatConversation
					activeThread={activeThread}
					temporaryMode={temporaryMode}
					isSending={isSending}
					mode="unified"
					webSearchEnabled={
						activeThread?.settings.webSearchEnabled ?? false
					}
					onWebSearchEnabledChange={(enabled) =>
						updateActiveSettings({ webSearchEnabled: enabled })
					}
					serverToolWebSearchEngine={
						activeThread?.settings.serverToolWebSearchEngine ??
						DEFAULT_SETTINGS.serverToolWebSearchEngine
					}
					onServerToolWebSearchEngineChange={(engine) =>
						updateActiveSettings({ serverToolWebSearchEngine: engine })
					}
					serverToolWebSearchContextSize={
						activeThread?.settings.serverToolWebSearchContextSize ??
						DEFAULT_SETTINGS.serverToolWebSearchContextSize
					}
					onServerToolWebSearchContextSizeChange={(contextSize) =>
						updateActiveSettings({
							serverToolWebSearchContextSize: contextSize,
						})
					}
					serverToolWebSearchMaxResults={
						activeThread?.settings.serverToolWebSearchMaxResults ??
						DEFAULT_SETTINGS.serverToolWebSearchMaxResults
					}
					onServerToolWebSearchMaxResultsChange={(maxResults) =>
						updateActiveSettings({
							serverToolWebSearchMaxResults: maxResults,
						})
					}
					serverToolWebSearchMaxTotalResults={
						activeThread?.settings.serverToolWebSearchMaxTotalResults ??
						DEFAULT_SETTINGS.serverToolWebSearchMaxTotalResults
					}
					onServerToolWebSearchMaxTotalResultsChange={(maxTotalResults) =>
						updateActiveSettings({
							serverToolWebSearchMaxTotalResults: maxTotalResults,
						})
					}
					serverToolWebSearchMaxCharacters={
						activeThread?.settings.serverToolWebSearchMaxCharacters ??
						DEFAULT_SETTINGS.serverToolWebSearchMaxCharacters
					}
					onServerToolWebSearchMaxCharactersChange={(maxCharacters) =>
						updateActiveSettings({
							serverToolWebSearchMaxCharacters: maxCharacters,
						})
					}
					serverToolWebSearchAllowedDomains={
						activeThread?.settings.serverToolWebSearchAllowedDomains ??
						DEFAULT_SETTINGS.serverToolWebSearchAllowedDomains
					}
					onServerToolWebSearchAllowedDomainsChange={(allowedDomains) =>
						updateActiveSettings({
							serverToolWebSearchAllowedDomains: allowedDomains,
						})
					}
					serverToolWebSearchBlockedDomains={
						activeThread?.settings.serverToolWebSearchBlockedDomains ??
						DEFAULT_SETTINGS.serverToolWebSearchBlockedDomains
					}
					onServerToolWebSearchBlockedDomainsChange={(blockedDomains) =>
						updateActiveSettings({
							serverToolWebSearchBlockedDomains: blockedDomains,
						})
					}
					apiServerToolsEnabled={
						activeThread?.settings.apiServerToolsEnabled ?? false
					}
					onApiServerToolsEnabledChange={(enabled) =>
						updateActiveSettings({ apiServerToolsEnabled: enabled })
					}
					serverToolTimezone={
						activeThread?.settings.serverToolTimezone ?? ""
					}
					onServerToolTimezoneChange={(timezone) =>
						updateActiveSettings({ serverToolTimezone: timezone })
					}
					serverToolWebFetchEnabled={
						activeThread?.settings.serverToolWebFetchEnabled ?? false
					}
					onServerToolWebFetchEnabledChange={(enabled) =>
						updateActiveSettings({ serverToolWebFetchEnabled: enabled })
					}
					serverToolWebFetchEngine={
						activeThread?.settings.serverToolWebFetchEngine ??
						DEFAULT_SETTINGS.serverToolWebFetchEngine
					}
					onServerToolWebFetchEngineChange={(engine) =>
						updateActiveSettings({ serverToolWebFetchEngine: engine })
					}
					serverToolWebFetchMaxContentTokens={
						activeThread?.settings.serverToolWebFetchMaxContentTokens ??
						DEFAULT_SETTINGS.serverToolWebFetchMaxContentTokens
					}
					onServerToolWebFetchMaxContentTokensChange={(maxContentTokens) =>
						updateActiveSettings({
							serverToolWebFetchMaxContentTokens: maxContentTokens,
						})
					}
					serverToolWebFetchAllowedDomains={
						activeThread?.settings.serverToolWebFetchAllowedDomains ??
						DEFAULT_SETTINGS.serverToolWebFetchAllowedDomains
					}
					onServerToolWebFetchAllowedDomainsChange={(allowedDomains) =>
						updateActiveSettings({
							serverToolWebFetchAllowedDomains: allowedDomains,
						})
					}
					serverToolWebFetchBlockedDomains={
						activeThread?.settings.serverToolWebFetchBlockedDomains ??
						DEFAULT_SETTINGS.serverToolWebFetchBlockedDomains
					}
					onServerToolWebFetchBlockedDomainsChange={(blockedDomains) =>
						updateActiveSettings({
							serverToolWebFetchBlockedDomains: blockedDomains,
						})
					}
					serverToolAdvisorEnabled={
						activeThread?.settings.serverToolAdvisorEnabled ?? false
					}
					onServerToolAdvisorEnabledChange={(enabled) =>
						updateActiveSettings({ serverToolAdvisorEnabled: enabled })
					}
					serverToolAdvisors={
						activeThread?.settings.serverToolAdvisors ??
						DEFAULT_SETTINGS.serverToolAdvisors ??
						[]
					}
					onServerToolAdvisorsChange={(advisors) =>
						updateActiveSettings({ serverToolAdvisors: advisors })
					}
					serverToolImageGenerationEnabled={
						activeThread?.settings.serverToolImageGenerationEnabled ??
						false
					}
					onServerToolImageGenerationEnabledChange={(enabled) =>
						updateActiveSettings({
							serverToolImageGenerationEnabled: enabled,
						})
					}
					serverToolImageGenerationModel={
						activeThread?.settings.serverToolImageGenerationModel ??
						DEFAULT_SETTINGS.serverToolImageGenerationModel
					}
					onServerToolImageGenerationModelChange={(model) =>
						updateActiveSettings({
							serverToolImageGenerationModel: model,
						})
					}
					serverToolImageGenerationQuality={
						activeThread?.settings.serverToolImageGenerationQuality ??
						DEFAULT_SETTINGS.serverToolImageGenerationQuality
					}
					onServerToolImageGenerationQualityChange={(quality) =>
						updateActiveSettings({
							serverToolImageGenerationQuality: quality,
						})
					}
					serverToolImageGenerationAspectRatio={
						activeThread?.settings.serverToolImageGenerationAspectRatio ??
						DEFAULT_SETTINGS.serverToolImageGenerationAspectRatio
					}
					onServerToolImageGenerationAspectRatioChange={(aspectRatio) =>
						updateActiveSettings({
							serverToolImageGenerationAspectRatio: aspectRatio,
						})
					}
					serverToolImageGenerationSize={
						activeThread?.settings.serverToolImageGenerationSize ??
						DEFAULT_SETTINGS.serverToolImageGenerationSize
					}
					onServerToolImageGenerationSizeChange={(size) =>
						updateActiveSettings({
							serverToolImageGenerationSize: size,
						})
					}
					serverToolImageGenerationBackground={
						activeThread?.settings.serverToolImageGenerationBackground ??
						DEFAULT_SETTINGS.serverToolImageGenerationBackground
					}
					onServerToolImageGenerationBackgroundChange={(background) =>
						updateActiveSettings({
							serverToolImageGenerationBackground: background,
						})
					}
					serverToolImageGenerationOutputFormat={
						activeThread?.settings.serverToolImageGenerationOutputFormat ??
						DEFAULT_SETTINGS.serverToolImageGenerationOutputFormat
					}
					onServerToolImageGenerationOutputFormatChange={(outputFormat) =>
						updateActiveSettings({
							serverToolImageGenerationOutputFormat: outputFormat,
						})
					}
					serverToolImageGenerationOutputCompression={
						activeThread?.settings.serverToolImageGenerationOutputCompression ??
						DEFAULT_SETTINGS.serverToolImageGenerationOutputCompression
					}
					onServerToolImageGenerationOutputCompressionChange={(
						outputCompression,
					) =>
						updateActiveSettings({
							serverToolImageGenerationOutputCompression:
								outputCompression,
						})
					}
					serverToolImageGenerationModeration={
						activeThread?.settings.serverToolImageGenerationModeration ??
						DEFAULT_SETTINGS.serverToolImageGenerationModeration
					}
					onServerToolImageGenerationModerationChange={(moderation) =>
						updateActiveSettings({
							serverToolImageGenerationModeration: moderation,
						})
					}
					serverToolSubagentEnabled={
						activeThread?.settings.serverToolSubagentEnabled ?? false
					}
					onServerToolSubagentEnabledChange={(enabled) =>
						updateActiveSettings({ serverToolSubagentEnabled: enabled })
					}
					serverToolSubagentModel={
						activeThread?.settings.serverToolSubagentModel ?? ""
					}
					onServerToolSubagentModelChange={(model) =>
						updateActiveSettings({ serverToolSubagentModel: model })
					}
					serverToolSubagentInstructions={
						activeThread?.settings.serverToolSubagentInstructions ?? ""
					}
					onServerToolSubagentInstructionsChange={(instructions) =>
						updateActiveSettings({
							serverToolSubagentInstructions: instructions,
						})
					}
					serverToolSubagentMaxUses={
						activeThread?.settings.serverToolSubagentMaxUses ?? null
					}
					onServerToolSubagentMaxUsesChange={(maxUses) =>
						updateActiveSettings({ serverToolSubagentMaxUses: maxUses })
					}
					serverToolFusionEnabled={
						activeThread?.settings.serverToolFusionEnabled ?? false
					}
					onServerToolFusionEnabledChange={(enabled) =>
						updateActiveSettings({ serverToolFusionEnabled: enabled })
					}
					serverToolFusionAnalysisModels={resolveFusionAnalysisModels(
						activeThread?.settings.serverToolFusionAnalysisModels,
						defaultFusionAnalysisModels
					)}
					onServerToolFusionAnalysisModelsChange={(models) =>
						updateActiveSettings({
							serverToolFusionAnalysisModels: models,
						})
					}
					serverToolFusionJudgeModel={resolveFusionJudgeModel(
						activeThread?.settings.serverToolFusionJudgeModel,
						defaultFusionJudgeModel
					)}
					onServerToolFusionJudgeModelChange={(model) =>
						updateActiveSettings({ serverToolFusionJudgeModel: model })
					}
					serverToolFusionMaxUses={
						activeThread?.settings.serverToolFusionMaxUses ?? null
					}
					onServerToolFusionMaxUsesChange={(maxUses) =>
						updateActiveSettings({ serverToolFusionMaxUses: maxUses })
					}
					serverToolModelChoices={serverToolModelChoices}
					serverToolLatestModelChoices={serverToolLatestModelChoices}
					serverToolImageGenerationModelChoices={
						serverToolImageGenerationModelChoices
					}
					serverToolImageGenerationLatestModelChoices={
						serverToolImageGenerationLatestModelChoices
					}
					contextMessageLimit={
						activeThread?.settings.contextMessageLimit ??
						DEFAULT_SETTINGS.contextMessageLimit ??
						10
					}
					onContextMessageLimitChange={(contextMessageLimit) =>
						updateActiveSettings({ contextMessageLimit })
					}
					reasoningEnabled={
						activeThread?.settings.reasoningEnabled ?? false
					}
					reasoningEffort={
						activeThread?.settings.reasoningEffort ?? "medium"
					}
					supportedReasoningEfforts={selectedSupportedReasoningEfforts}
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
					modelDefaultProviderById={modelDefaultProviderById}
					isAuthenticated={isAuthenticated}
					accentColor={personalization.accentColor}
					onAudioAttachmentRequirementChange={(requiresAudioInput) =>
						setComposerRequiresAudioInput(requiresAudioInput)
					}
					requestError={requestError}
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
						? (models.find((m) => m.modelId === modelSettingsModelId)
								?.modelName ??
							formatModelLabel(modelSettingsModelId))
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
			{tagsOpen ? (
				<ChatTagsDialog
					key={tagsTarget?.id ?? "chat-tags"}
					open={tagsOpen}
					thread={tagsTarget}
					availableTags={allTags}
					onOpenChange={handleTagsOpenChange}
					onSave={handleTagsSave}
				/>
			) : null}
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
		<SidebarProvider
			defaultOpen
			contained
			className="h-full overflow-hidden"
		>
			<ChatPlaygroundContent {...props} />
		</SidebarProvider>
	);
}
