"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	formatModelLabel,
	formatOrgLabel,
	getOrgId,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	getRoomScopedStorageKey,
	type ChatRoomId,
} from "@/lib/chat/rooms";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

type NonTextRoomId = Exclude<ChatRoomId, "text">;

export type RoomBaseModelSettings = {
	enabled: boolean;
	displayName: string;
	providerId: string;
};

export type RoomModelProfile<TParams extends Record<string, unknown>> =
	RoomBaseModelSettings & {
		params: TParams;
	};

type StoredRoomModelProfile<TParams extends Record<string, unknown>> =
	Partial<RoomBaseModelSettings> & {
		params?: Partial<TParams>;
	};

type ModelChoice = {
	id: string;
	label: string;
	orgId: string;
	orgName: string;
};

type ProviderOption = {
	id: string;
	name: string;
};

type UseRoomModelSettingsArgs<TParams extends Record<string, unknown>> = {
	roomId: NonTextRoomId;
	models: GatewaySupportedModel[];
	selectedModelId: string;
	onModelChange: (modelId: string) => void;
	getDefaultParams: (modelId: string) => TParams;
};

type UseRoomModelSettingsResult<TParams extends Record<string, unknown>> = {
	selectedProfile: RoomModelProfile<TParams> | null;
	getProfileForModel: (modelId: string) => RoomModelProfile<TParams>;
	modelDisplayNameById: Record<string, string>;
	modelEnabledById: Record<string, boolean>;
	modelSettingsOpen: boolean;
	handleModelSettingsOpenChange: (open: boolean) => void;
	openModelSettingsForModel: (modelId: string) => void;
	modelSettingsModelId: string | null;
	modelSettingsModelLabel?: string;
	modelSettingsChoices: ModelChoice[];
	handleModelSettingsModelChange: (modelId: string) => void;
	providerOptions: ProviderOption[];
	supportedProvidersForModel: string[] | undefined;
	updateModelBaseSettings: (partial: Partial<RoomBaseModelSettings>) => void;
	updateModelParams: (partial: Partial<TParams>) => void;
	resetModelSettings: () => void;
};

function normalizeStoredProfiles<TParams extends Record<string, unknown>>(
	value: unknown,
): Record<string, StoredRoomModelProfile<TParams>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	const record = value as Record<string, unknown>;
	const next: Record<string, StoredRoomModelProfile<TParams>> = {};
	for (const [modelId, profile] of Object.entries(record)) {
		if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
			continue;
		}
		next[modelId] = { ...(profile as StoredRoomModelProfile<TParams>) };
	}
	return next;
}

const DEFAULT_BASE_SETTINGS: RoomBaseModelSettings = {
	enabled: true,
	displayName: "",
	providerId: "auto",
};

export function useRoomModelSettings<TParams extends Record<string, unknown>>({
	roomId,
	models,
	selectedModelId,
	onModelChange,
	getDefaultParams,
}: UseRoomModelSettingsArgs<TParams>): UseRoomModelSettingsResult<TParams> {
	const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
	const [modelSettingsTargetModelId, setModelSettingsTargetModelId] = useState<
		string | null
	>(null);
	const storageKey = getRoomScopedStorageKey(roomId, "model-profiles-v2");
	const selectedModelStorageKey = getRoomScopedStorageKey(roomId, "last-model-id");
	const [storedProfilesById, setStoredProfilesById] = useState<
		Record<string, StoredRoomModelProfile<TParams>>
	>(() => {
		if (typeof window === "undefined") return {};
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return {};
		try {
			return normalizeStoredProfiles<TParams>(JSON.parse(raw));
		} catch {
			return {};
		}
	});
	const hasAppliedStoredModelSelectionRef = useRef(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(storageKey, JSON.stringify(storedProfilesById));
	}, [storageKey, storedProfilesById]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const normalizedSelectedModelId = selectedModelId.trim();
		if (!normalizedSelectedModelId) return;
		window.localStorage.setItem(
			selectedModelStorageKey,
			normalizedSelectedModelId,
		);
	}, [selectedModelId, selectedModelStorageKey]);

	useLayoutEffect(() => {
		if (hasAppliedStoredModelSelectionRef.current) return;
		if (typeof window === "undefined") return;
		if (models.length === 0) return;

		const storedModelId = (
			window.localStorage.getItem(selectedModelStorageKey) ?? ""
		).trim();
		if (!storedModelId) {
			hasAppliedStoredModelSelectionRef.current = true;
			return;
		}

		const hasStoredModel = models.some(
			(model) => model.modelId === storedModelId,
		);
		if (hasStoredModel && storedModelId !== selectedModelId) {
			onModelChange(storedModelId);
		}
		hasAppliedStoredModelSelectionRef.current = true;
	}, [
		models,
		onModelChange,
		selectedModelId,
		selectedModelStorageKey,
	]);

	const modelSettingsModelId = modelSettingsTargetModelId ?? selectedModelId ?? null;

	const getProfileForModel = useCallback(
		(modelId: string): RoomModelProfile<TParams> => {
			const stored = storedProfilesById[modelId] ?? {};
			const defaultParams = getDefaultParams(modelId);
			return {
				enabled: stored.enabled !== false,
				displayName:
					typeof stored.displayName === "string" ? stored.displayName : "",
				providerId:
					typeof stored.providerId === "string" && stored.providerId.trim()
						? stored.providerId
						: "auto",
				params: {
					...defaultParams,
					...(stored.params ?? {}),
				},
			};
		},
		[getDefaultParams, storedProfilesById],
	);

	const selectedProfile = useMemo(
		() => (selectedModelId ? getProfileForModel(selectedModelId) : null),
		[getProfileForModel, selectedModelId],
	);

	const modelDisplayNameById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const model of models) {
			const name = getProfileForModel(model.modelId).displayName.trim();
			if (name) {
				map[model.modelId] = name;
			}
		}
		return map;
	}, [getProfileForModel, models]);

	const modelEnabledById = useMemo(() => {
		const map: Record<string, boolean> = {};
		for (const model of models) {
			map[model.modelId] = getProfileForModel(model.modelId).enabled !== false;
		}
		return map;
	}, [getProfileForModel, models]);

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

	const modelSettingsChoices = useMemo(() => {
		const map = new Map<string, ModelChoice>();
		for (const model of models) {
			if (map.has(model.modelId)) continue;
			const orgId = getOrgId(model.modelId);
			const orgName =
				model.organisationName ?? model.providerName ?? formatOrgLabel(orgId);
			const baseLabel = model.modelName || formatModelLabel(model.modelId);
			const isDisabled = getProfileForModel(model.modelId).enabled === false;
			map.set(model.modelId, {
				id: model.modelId,
				label: isDisabled ? `${baseLabel} (Off)` : baseLabel,
				orgId,
				orgName,
			});
		}
		return Array.from(map.values()).sort(
			(a, b) => a.orgName.localeCompare(b.orgName) || a.label.localeCompare(b.label),
		);
	}, [getProfileForModel, models]);

	const supportedProvidersForModel = useMemo(() => {
		if (!modelSettingsModelId) return undefined;
		const ids = Array.from(
			new Set(
				models
					.filter((model) => model.modelId === modelSettingsModelId)
					.map((model) => model.providerId),
			),
		);
		return ids.length ? ids : undefined;
	}, [modelSettingsModelId, models]);

	const modelSettingsModelLabel = useMemo(() => {
		if (!modelSettingsModelId) return undefined;
		const model = models.find((entry) => entry.modelId === modelSettingsModelId);
		return model?.modelName ?? formatModelLabel(modelSettingsModelId);
	}, [modelSettingsModelId, models]);

	const updateModelBaseSettings = useCallback(
		(partial: Partial<RoomBaseModelSettings>) => {
			if (!modelSettingsModelId) return;
			setStoredProfilesById((current) => {
				const existing = current[modelSettingsModelId] ?? {};
				return {
					...current,
					[modelSettingsModelId]: {
						...DEFAULT_BASE_SETTINGS,
						...existing,
						...partial,
					},
				};
			});
		},
		[modelSettingsModelId],
	);

	const updateModelParams = useCallback(
		(partial: Partial<TParams>) => {
			if (!modelSettingsModelId) return;
			setStoredProfilesById((current) => {
				const existing = current[modelSettingsModelId] ?? {};
				const currentParams =
					(existing.params as Partial<TParams> | undefined) ?? {};
				return {
					...current,
					[modelSettingsModelId]: {
						...DEFAULT_BASE_SETTINGS,
						...existing,
						params: {
							...getDefaultParams(modelSettingsModelId),
							...currentParams,
							...partial,
						},
					},
				};
			});
		},
		[getDefaultParams, modelSettingsModelId],
	);

	const resetModelSettings = useCallback(() => {
		if (!modelSettingsModelId) return;
		setStoredProfilesById((current) => {
			if (!(modelSettingsModelId in current)) return current;
			const next = { ...current };
			delete next[modelSettingsModelId];
			return next;
		});
	}, [modelSettingsModelId]);

	const openModelSettingsForModel = useCallback((modelId: string) => {
		setModelSettingsTargetModelId(modelId);
		setModelSettingsOpen(true);
	}, []);

	const handleModelSettingsOpenChange = useCallback((open: boolean) => {
		setModelSettingsOpen(open);
		if (!open) {
			setModelSettingsTargetModelId(null);
		}
	}, []);

	const handleModelSettingsModelChange = useCallback(
		(modelId: string) => {
			setModelSettingsTargetModelId(modelId);
			onModelChange(modelId);
		},
		[onModelChange],
	);

	return {
		selectedProfile,
		getProfileForModel,
		modelDisplayNameById,
		modelEnabledById,
		modelSettingsOpen,
		handleModelSettingsOpenChange,
		openModelSettingsForModel,
		modelSettingsModelId,
		modelSettingsModelLabel,
		modelSettingsChoices,
		handleModelSettingsModelChange,
		providerOptions,
		supportedProvidersForModel,
		updateModelBaseSettings,
		updateModelParams,
		resetModelSettings,
	};
}
