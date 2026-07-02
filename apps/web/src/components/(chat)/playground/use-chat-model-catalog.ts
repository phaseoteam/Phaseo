import { useCallback, useMemo } from "react";
import {
	CHAT_DEFAULT_MODEL_IDS,
	compareByReleaseDateDesc,
} from "@/components/(chat)/playgroundConfig";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import type { UnifiedChatEndpoint } from "@/lib/indexeddb/chats";
import {
	AUDIO_INPUT_MODEL_HINTS,
	capabilityIdsToUnifiedEndpoints,
	getPrimaryUnifiedCapability,
	inferModelCapabilityEndpoint,
	supportsAudioInputByCapabilities,
} from "@/components/(chat)/playground/capability-utils";
import {
	formatModelLabel,
	formatOrgLabel,
	getOrgId,
	isModelExpired,
	type ModelOption,
} from "@/components/(chat)/playground/chat-playground-core";
import { buildChatProviderOptions } from "@/components/(chat)/playground/provider-options";

export const resolveGatewayModelOrgId = (model: GatewaySupportedModel) =>
	model.organisationId?.trim() || getOrgId(model.modelId);

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

export function useChatModelCatalog(args: {
	models: GatewaySupportedModel[];
	modelParam?: string | null;
}) {
	const { models, modelParam } = args;
	const selectableModels = useMemo(
		() =>
			filterModelsForRoom(models, "text").filter(
				(model) => !isModelExpired(model),
			),
		[models],
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
	const defaultModelId =
		CHAT_DEFAULT_MODEL_IDS.find((modelId) =>
			selectableModels.some((model) => model.selectorModelId === modelId),
		) ??
		selectableModels[0]?.selectorModelId ??
		"";
	const queryModelId = (modelParam ?? "").trim();
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
					providerIds: [model.providerId],
					providerNames: [
						model.providerName ?? formatOrgLabel(model.providerId),
					],
					providerAvailability: {
						[model.providerId]: model.isAvailable,
					},
					releaseDate,
					gatewayStatus: model.isAvailable ? "active" : "inactive",
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

	const providerOptions = useMemo(() => {
		return buildChatProviderOptions(models);
	}, [models]);
	const providerNameById = useMemo(
		() =>
			new Map(providerOptions.map((provider) => [provider.id, provider.name])),
		[providerOptions],
	);
	const getSupportedProviderIdsForModel = useCallback(
		(modelId: string) =>
			availableProviderIdsByModelId.get(
				selectorModelIdByRawModelId.get(modelId) ?? modelId,
			) ?? [],
		[availableProviderIdsByModelId, selectorModelIdByRawModelId],
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

	return {
		selectableModels,
		selectorModelIdByRawModelId,
		defaultModelId,
		selectableModelIdSet,
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
	};
}
