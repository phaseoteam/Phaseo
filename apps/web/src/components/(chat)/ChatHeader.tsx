"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorSeparator,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/color-picker";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { ChatShortcutReference } from "@/components/(chat)/ChatShortcutReference";
import {
	compareByReleaseDateDesc,
	groupModelsByReleaseMonth,
	getDefaultFavoriteModelIds,
	MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import { cn } from "@/lib/utils";
import type {
	ChatApiTarget,
	ChatResponseLayout,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	LOCAL_CHAT_API_BASE_URL,
} from "@/components/(chat)/playground/chat-playground-core";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type {
	ChatModelSettings,
	ChatThread,
	UnifiedChatEndpoint,
} from "@/lib/indexeddb/chats";
import {
	ArrowLeft,
	ArrowRight,
	ChevronsLeft,
	ChevronDown,
	ChevronRight,
	Check,
	CircleCheck,
	CircleQuestionMark,
	Columns2,
	Database,
	Keyboard,
	List,
	MessageCircleDashed,
	Paintbrush,
	Plus,
	Power,
	PowerOff,
	Settings,
	Settings2,
	Shield,
	Star,
	Trash2,
	X,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type ModelOption = {
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

type ModelOptions = {
	active: ModelOption[];
	comingSoon: ModelOption[];
};

type PersonalizationSettings = {
	name: string;
	role: string;
	notes: string;
	accentColor: string;
};

const ACCENT_COLORS = [
	{ label: "Charcoal", value: "#111111" },
	{ label: "Slate", value: "#334155" },
	{ label: "Indigo", value: "#4338ca" },
	{ label: "Emerald", value: "#047857" },
	{ label: "Cyan", value: "#0e7490" },
	{ label: "Orange", value: "#c2410c" },
	{ label: "Rose", value: "#be123c" },
	{ label: "Amber", value: "#b45309" },
];

const CUSTOM_ACCENT_SELECT_VALUE = "custom";
const DEFAULT_CUSTOM_ACCENT_COLOR = "#2563eb";
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_API_SELECT_VALUE = "custom";

function normalizeHexColor(value: string) {
	const trimmedValue = value.trim();
	const prefixedValue = trimmedValue.startsWith("#")
		? trimmedValue
		: `#${trimmedValue}`;

	if (!HEX_COLOR_PATTERN.test(prefixedValue)) {
		return null;
	}

	return prefixedValue.toLowerCase();
}

function isPresetAccentColorValue(value: string) {
	return ACCENT_COLORS.some((color) => color.value === value);
}

function AccentColorSwatch({
	color,
	unknown = false,
	className,
}: {
	color?: string;
	unknown?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border",
				unknown && "bg-muted text-muted-foreground",
				className,
			)}
			style={{
				background: unknown ? undefined : color,
			}}
		>
			{unknown ? (
				<CircleQuestionMark className="h-3 w-3" strokeWidth={2.25} />
			) : null}
		</span>
	);
}

const CAPABILITY_LABELS: Record<UnifiedChatEndpoint, string> = {
	responses: "Text",
	"images.generations": "Image",
	"video.generation": "Video",
	"audio.speech": "Audio",
	"audio.transcription": "Transcription",
	"audio.translation": "Translation",
	moderations: "Moderation",
	embeddings: "Embeddings",
};

const getModelBadgeProps = (suffix: string) => {
	switch (suffix) {
		case "free":
			return {
				variant: "secondary" as const,
				className:
					"text-xs shrink-0 bg-green-200 text-green-900 border-green-400 dark:bg-green-800 dark:text-green-100 dark:border-green-600 font-normal px-1 py-0",
			};
		case "new":
			return {
				variant: "secondary" as const,
				className:
					"text-xs shrink-0 bg-blue-200 text-blue-900 border-blue-400 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-600 font-normal px-1 py-0",
			};
		default:
			return {
				variant: "outline" as const,
				className: "text-xs shrink-0 font-normal px-1.5 py-0.5",
			};
	}
};

const isNewModel = (releaseDate: string | null): boolean => {
	if (!releaseDate) return false;
	const release = new Date(releaseDate);
	const now = new Date();
	const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
	return release >= twoWeeksAgo;
};

type ChatHeaderProps = {
	activeThread: ChatThread | null;
	modelOptions: ModelOptions;
	modelPickerOpen: boolean;
	onModelPickerOpenChange: (open: boolean) => void;
	onUpdateModel: (modelId: string) => void;
	temporaryMode: boolean;
	onToggleTemporaryMode: () => void;
	onOpenModelSettings: () => void;
	settingsOpen: boolean;
	onSettingsOpenChange: (open: boolean) => void;
	apiTarget: ChatApiTarget;
	onApiTargetChange: (value: ChatApiTarget) => void;
	baseUrl: string;
	onBaseUrlChange: (value: string) => void;
	onSaveSettings: () => void;
	personalization: PersonalizationSettings;
	onPersonalizationChange: (next: PersonalizationSettings) => void;
	onExportChats: () => void;
	isAdmin: boolean;
	debugEnabled: boolean;
	onDebugChange: (value: boolean) => void;
	responseLayout: ChatResponseLayout;
	onResponseLayoutChange: (value: ChatResponseLayout) => void;
	allowModelCompare?: boolean;
	compareModelIds?: string[];
	onCompareModelIdsChange?: (ids: string[]) => void;
	onSelectedModelOrderChange?: (ids: string[]) => void;
	onRemoveModel?: (modelId: string) => void;
	onRemoveAllModels?: () => void;
	onOpenModelSettingsForModel?: (modelId: string) => void;
	onUpdateModelSettingsForModel?: (
		modelId: string,
		partial: Partial<ChatModelSettings>,
	) => void;
	modelDisplayNameById?: Record<string, string>;
	modelEnabledById?: Record<string, boolean>;
	modelCapabilitiesById?: Record<string, UnifiedChatEndpoint[]>;
	modelSupportsAudioInputById?: Record<string, boolean>;
	requiredCapability?: UnifiedChatEndpoint | null;
	requireAudioInput?: boolean;
};

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "phaseo";
}

export function ChatHeader({
	activeThread,
	modelOptions,
	modelPickerOpen,
	onModelPickerOpenChange,
	onUpdateModel,
	temporaryMode,
	onToggleTemporaryMode,
	onOpenModelSettings,
	settingsOpen,
	onSettingsOpenChange,
	apiTarget,
	onApiTargetChange,
	baseUrl,
	onBaseUrlChange,
	onSaveSettings,
	personalization,
	onPersonalizationChange,
	onExportChats,
	isAdmin,
	debugEnabled,
	onDebugChange,
	responseLayout,
	onResponseLayoutChange,
	allowModelCompare = false,
	compareModelIds = [],
	onCompareModelIdsChange,
	onSelectedModelOrderChange,
	onRemoveModel,
	onRemoveAllModels,
	onOpenModelSettingsForModel,
	onUpdateModelSettingsForModel,
	modelDisplayNameById,
	modelEnabledById,
	modelCapabilitiesById,
	modelSupportsAudioInputById,
	requiredCapability = null,
	requireAudioInput = false,
}: ChatHeaderProps) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const [settingsTab, setSettingsTab] = useState<
		"personalization" | "data-controls" | "shortcuts" | "admin"
	>("personalization");
	const [modelSearchValue, setModelSearchValue] = useState("");
	const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
	const [quickFilters, setQuickFilters] = useState({
		free: false,
		new: false,
	});
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);
	const [importResult, setImportResult] = useState<{
		message: string;
		type: "success" | "error" | "info";
	} | null>(null);
	const [accentSelectValueOverride, setAccentSelectValueOverride] = useState<
		string | null
	>(null);
	const [apiTargetValueOverride, setApiTargetValueOverride] = useState<
		string | null
	>(null);
	const [customAccentDraft, setCustomAccentDraft] = useState(
		() => {
			const normalizedAccentColor = normalizeHexColor(
				personalization.accentColor,
			);

			if (
				normalizedAccentColor &&
				!isPresetAccentColorValue(normalizedAccentColor)
			) {
				return normalizedAccentColor;
			}

			return "";
		},
	);
	const selectedPresetAccentColor = useMemo(
		() =>
			ACCENT_COLORS.find(
				(color) => color.value === personalization.accentColor,
		),
		[personalization.accentColor],
	);
	const isCustomAccentColor = !selectedPresetAccentColor;
	const customAccentColor = normalizeHexColor(customAccentDraft);
	const customAccentPickerValue =
		customAccentColor ?? DEFAULT_CUSTOM_ACCENT_COLOR;
	const selectedAccentSelectValue =
		accentSelectValueOverride ??
		selectedPresetAccentColor?.value ??
		CUSTOM_ACCENT_SELECT_VALUE;
	const isCustomAccentSelected =
		selectedAccentSelectValue === CUSTOM_ACCENT_SELECT_VALUE;
	const selectedAccentColor = isCustomAccentSelected
		? {
				label: "Custom",
				value: customAccentColor,
			}
		: selectedPresetAccentColor;
	const customBaseUrl = baseUrl.trim();
	const effectiveBaseUrl =
		apiTarget === "default"
			? "Server default"
			: apiTarget === "local"
			? LOCAL_CHAT_API_BASE_URL
			: apiTarget === "custom" && customBaseUrl
				? customBaseUrl
				: BASE_URL;
	const apiTargetValue = apiTargetValueOverride ?? apiTarget;
	useEffect(() => {
		const isPresetAccentColor = ACCENT_COLORS.some(
			(color) => color.value === personalization.accentColor,
		);

		if (!isPresetAccentColor) {
			setCustomAccentDraft(personalization.accentColor);
		}
	}, [personalization.accentColor]);
	const handleAccentColorChange = (accentColor: string) => {
		onPersonalizationChange({
			...personalization,
			accentColor,
		});
	};
	const handleAccentSelectValueChange = (value: string) => {
		if (value === CUSTOM_ACCENT_SELECT_VALUE) {
			setAccentSelectValueOverride(CUSTOM_ACCENT_SELECT_VALUE);
			const normalizedValue = normalizeHexColor(customAccentDraft);

			if (normalizedValue && !isPresetAccentColorValue(normalizedValue)) {
				handleAccentColorChange(normalizedValue);
			}
			return;
		}

		setAccentSelectValueOverride(null);
		handleAccentColorChange(value);
	};
	const handleCustomAccentDraftChange = (value: string) => {
		setCustomAccentDraft(value);
		const normalizedValue = normalizeHexColor(value);

		if (!normalizedValue) {
			return;
		}

		handleAccentColorChange(normalizedValue);
	};
	const toggleQuickFilter = (key: "free" | "new") => {
		setQuickFilters((prev) => ({ ...prev, [key]: !prev[key] }));
	};
	const optionMatchesQuickFilters = useCallback(
		(option: ModelOption) => {
			if (quickFilters.free && !option.modelId.endsWith(":free")) {
				return false;
			}
			if (quickFilters.new && !isNewModel(option.releaseDate)) {
				return false;
			}
			return true;
		},
		[quickFilters.free, quickFilters.new]
	);
	const filteredActive = useMemo(
		() => modelOptions.active.filter(optionMatchesQuickFilters),
		[modelOptions.active, optionMatchesQuickFilters]
	);
	const filteredComingSoonEntries = useMemo(
		() => modelOptions.comingSoon.filter(optionMatchesQuickFilters),
		[modelOptions.comingSoon, optionMatchesQuickFilters]
	);
	const favoriteModelIds = useMemo(
		() => Array.from(favoriteModelIdSet),
		[favoriteModelIdSet],
	);
	const favoriteActiveOptions = useMemo(
		() => {
			const byId = new Map(
				filteredActive.map((option) => [
					normalizeFavoriteModelId(option.modelId),
					option,
				]),
			);
			return favoriteModelIds
				.map((favoriteModelId) => byId.get(favoriteModelId))
				.filter((option): option is ModelOption => Boolean(option));
		},
		[filteredActive, favoriteModelIds],
	);
	const groupedActiveOptions = useMemo(
		() =>
			groupModelsByReleaseMonth(
				filteredActive.filter(
					(option) =>
						!favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId)),
				),
			),
		[filteredActive, favoriteModelIdSet],
	);
	const groupedComingSoonOptions = useMemo(
		() => groupModelsByReleaseMonth(filteredComingSoonEntries),
		[filteredComingSoonEntries],
	);
	const comingSoonCount = useMemo(
		() => filteredComingSoonEntries.length,
		[filteredComingSoonEntries]
	);
	const allModelOptions = useMemo(
		() => [
			...filteredActive,
			...filteredComingSoonEntries,
		],
		[filteredActive, filteredComingSoonEntries]
	);
	const uniqueModelOptions = useMemo(() => {
		const byId = new Map<string, ModelOption>();
		for (const option of allModelOptions) {
			const existing = byId.get(option.modelId);
			if (!existing) {
				byId.set(option.modelId, {
					...option,
					capabilityEndpoints: [...option.capabilityEndpoints],
					providerIds: [...option.providerIds],
					providerNames: [...option.providerNames],
					providerAvailability: { ...option.providerAvailability },
				});
				continue;
			}
			for (const endpoint of option.capabilityEndpoints) {
				if (!existing.capabilityEndpoints.includes(endpoint)) {
					existing.capabilityEndpoints.push(endpoint);
				}
			}
			for (const providerId of option.providerIds) {
				if (!existing.providerIds.includes(providerId)) {
					existing.providerIds.push(providerId);
				}
			}
			for (const providerName of option.providerNames) {
				if (!existing.providerNames.includes(providerName)) {
					existing.providerNames.push(providerName);
				}
			}
			for (const [providerId, isAvailable] of Object.entries(
				option.providerAvailability,
			)) {
				existing.providerAvailability[providerId] =
					Boolean(existing.providerAvailability[providerId]) || Boolean(isAvailable);
			}
			if (
				existing.gatewayStatus !== "active" &&
				option.gatewayStatus === "active"
			) {
				existing.gatewayStatus = "active";
			}
			if (!existing.releaseDate && option.releaseDate) {
				existing.releaseDate = option.releaseDate;
			}
		}
		return Array.from(byId.values());
	}, [allModelOptions]);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const availableFavoriteIds = new Set(
			uniqueModelOptions.map((option) => normalizeFavoriteModelId(option.modelId)),
		);
		const raw = window.localStorage.getItem(
			MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
		);
		if (!raw) {
			setFavoriteModelIdSet(
				new Set(
					getDefaultFavoriteModelIds().filter((id) =>
						availableFavoriteIds.has(id),
					),
				),
			);
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			const next = Array.isArray(parsed)
				? parsed
						.map((value) => normalizeFavoriteModelId(String(value)))
						.filter((id) => availableFavoriteIds.has(id))
				: [];
			setFavoriteModelIdSet(new Set(next));
		} catch {
			setFavoriteModelIdSet(
				new Set(
					getDefaultFavoriteModelIds().filter((id) =>
						availableFavoriteIds.has(id),
					),
				),
			);
		}
	}, [uniqueModelOptions]);
	const selectedModelIds = useMemo(() => {
		const ids: string[] = [];
		if (activeThread?.modelId) {
			ids.push(activeThread.modelId);
		}
		for (const id of compareModelIds ?? []) {
			if (!id || id === activeThread?.modelId) continue;
			ids.push(id);
		}
		return Array.from(new Set(ids));
	}, [activeThread?.modelId, compareModelIds]);
	const showResponseLayoutControl = selectedModelIds.length > 1;
	const compareModelIdSet = useMemo(
		() =>
			new Set(
				selectedModelIds.filter((id) => id !== activeThread?.modelId),
			),
		[selectedModelIds, activeThread?.modelId],
	);
	const selectedModelLabelById = useMemo(() => {
		const labelById = new Map<string, string>();
		for (const option of modelOptions.active) {
			labelById.set(option.modelId, option.label);
		}
		for (const option of modelOptions.comingSoon) {
			labelById.set(option.modelId, option.label);
		}
		return labelById;
	}, [modelOptions.active, modelOptions.comingSoon]);
	const selectedModelOrgIdById = useMemo(() => {
		const orgIdById = new Map<string, string>();
		for (const option of modelOptions.active) {
			orgIdById.set(option.modelId, option.orgId);
		}
		for (const option of modelOptions.comingSoon) {
			orgIdById.set(option.modelId, option.orgId);
		}
		return orgIdById;
	}, [modelOptions.active, modelOptions.comingSoon]);
	const getModelCapabilities = (modelId: string): UnifiedChatEndpoint[] =>
		modelCapabilitiesById?.[modelId] ?? ["responses"];
	const supportsModelAudioInput = (modelId: string) =>
		modelSupportsAudioInputById?.[modelId] === true;
	const isModelCapabilityCompatible = (modelId: string) =>
		(!requiredCapability ||
			getModelCapabilities(modelId).includes(requiredCapability)) &&
		(!requireAudioInput || supportsModelAudioInput(modelId));
	const getIncompatibleCapabilityLabel = (modelId: string) => {
		if (requireAudioInput && !supportsModelAudioInput(modelId)) {
			return "Audio input";
		}
		const labels = Array.from(
			new Set(
				getModelCapabilities(modelId).map(
					(capability) => CAPABILITY_LABELS[capability] ?? "Text",
				),
			),
		);
		if (labels.length === 0) return "Text";
		if (labels.length === 1) return labels[0];
		return labels.slice(0, 2).join("/");
	};
	const handleModelSelect = (modelId: string) => {
		if (!isModelCapabilityCompatible(modelId)) {
			return;
		}
		if (!allowModelCompare) {
			onUpdateModel(modelId);
			onModelPickerOpenChange(false);
			return;
		}
		if (!activeThread?.modelId) {
			onUpdateModel(modelId);
			onModelPickerOpenChange(false);
			return;
		}
		if (activeThread.modelId === modelId) {
			if (selectedModelIds.length > 0) {
				onRemoveModel?.(modelId);
			}
			onModelPickerOpenChange(false);
			return;
		}
		if (!onCompareModelIdsChange) {
			onUpdateModel(modelId);
			onModelPickerOpenChange(false);
			return;
		}
		const nextSet = new Set(compareModelIdSet);
		if (nextSet.has(modelId)) {
			nextSet.delete(modelId);
		} else {
			nextSet.add(modelId);
		}
		onCompareModelIdsChange(Array.from(nextSet));
		onModelPickerOpenChange(false);
	};
	const handleModelPickerDialogOpenChange = (open: boolean) => {
		onModelPickerOpenChange(open);
		if (!open) {
			setModelSearchValue("");
		}
	};
	const focusModelSearchInput = useCallback(() => {
		const input =
			modelSearchInputRef.current ??
			document.querySelector<HTMLInputElement>(
				"[data-chat-model-selector-search='true']",
			);
		input?.focus({ preventScroll: true });
	}, []);
	const scheduleModelSearchFocus = useCallback(() => {
		const timeoutIds: number[] = [];
		let secondFrame: number | null = null;
		focusModelSearchInput();
		for (const delay of [0, 25, 75, 150, 250, 400]) {
			timeoutIds.push(window.setTimeout(focusModelSearchInput, delay));
		}
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => {
				focusModelSearchInput();
				for (const delay of [25, 75, 150, 250, 400]) {
					timeoutIds.push(window.setTimeout(focusModelSearchInput, delay));
				}
			});
		});
		return () => {
			cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) {
				cancelAnimationFrame(secondFrame);
			}
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [focusModelSearchInput]);
	useEffect(() => {
		if (!modelPickerOpen) return;
		return scheduleModelSearchFocus();
	}, [modelPickerOpen, scheduleModelSearchFocus]);
	useEffect(() => {
		if (!modelPickerOpen) return;
		const handleModelPickerKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest("[data-chat-model-selector-search='true']")
			) {
				return;
			}
			const input =
				modelSearchInputRef.current ??
				document.querySelector<HTMLInputElement>(
					"[data-chat-model-selector-search='true']",
				);
			if (!input) return;
			if (event.key.length === 1) {
				event.preventDefault();
				event.stopPropagation();
				input.focus({ preventScroll: true });
				setModelSearchValue((value) => `${value}${event.key}`);
				return;
			}
			if (event.key === "Backspace") {
				event.preventDefault();
				event.stopPropagation();
				input.focus({ preventScroll: true });
				setModelSearchValue((value) => value.slice(0, -1));
			}
		};
		window.addEventListener("keydown", handleModelPickerKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleModelPickerKeyDown, true);
		};
	}, [modelPickerOpen]);
	const handleRemoveModel = (modelId: string) => {
		onRemoveModel?.(modelId);
	};
	const handleOpenModelSettings = (modelId: string) => {
		if (onOpenModelSettingsForModel) {
			onOpenModelSettingsForModel(modelId);
			return;
		}
		onOpenModelSettings();
	};
	const moveSelectedModelToIndex = (modelId: string, targetIndex: number) => {
		if (!onSelectedModelOrderChange || selectedModelIds.length < 2) return;
		const sourceIndex = selectedModelIds.indexOf(modelId);
		if (sourceIndex === -1) return;
		const nextIds = [...selectedModelIds];
		const [movedModelId] = nextIds.splice(sourceIndex, 1);
		if (!movedModelId) return;
		const clampedTargetIndex = Math.max(
			0,
			Math.min(targetIndex, nextIds.length),
		);
		nextIds.splice(clampedTargetIndex, 0, movedModelId);
		onSelectedModelOrderChange(Array.from(new Set(nextIds)));
	};
	const renderSelectedModelChip = (modelId: string) => {
		const orgId = selectedModelOrgIdById.get(modelId) ?? getOrgId(modelId);
		const baseLabel = (selectedModelLabelById.get(modelId) ?? modelId).split(
			":",
		)[0];
		const label = modelDisplayNameById?.[modelId]?.trim() || baseLabel;
		const modelEnabled = modelEnabledById?.[modelId] !== false;
		const canRemoveModel = Boolean(onRemoveModel);
		const canToggleModelEnabled = Boolean(onUpdateModelSettingsForModel);
		const canReorderModels =
			Boolean(onSelectedModelOrderChange) && selectedModelIds.length > 1;
		const selectedModelIndex = selectedModelIds.indexOf(modelId);
		const canMoveLeft = canReorderModels && selectedModelIndex > 0;
		const canMoveRight =
			canReorderModels &&
			selectedModelIndex >= 0 &&
			selectedModelIndex < selectedModelIds.length - 1;
		return (
			<ContextMenu key={modelId}>
				<ContextMenuTrigger asChild>
					<div
						className="relative shrink-0 rounded-2xl"
					>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleOpenModelSettings(modelId)}
							aria-label={`${label}. Right click for model actions.`}
							className={cn(
								"h-7 max-w-[220px] gap-1.5 rounded-2xl pl-2",
								!modelEnabled && "opacity-55",
								canRemoveModel ? "pr-7" : "pr-2",
							)}
						>
							<Logo
								id={orgId}
								alt={label}
								width={14}
								height={14}
								className="shrink-0 rounded-none"
							/>
							<span className="truncate text-xs">{label}</span>
						</Button>
						{canRemoveModel ? (
							<button
								type="button"
								className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									handleRemoveModel(modelId);
								}}
								aria-label={`Remove ${label}`}
							>
								<X className="h-3.5 w-3.5" />
							</button>
						) : null}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent className="min-w-48">
					<div className="max-w-44 truncate px-2 py-1 text-xs text-muted-foreground">
						{label}
					</div>
					<ContextMenuItem
						onClick={(event) => {
							event.preventDefault();
							handleOpenModelSettings(modelId);
						}}
					>
						<Settings2 className="h-4 w-4" />
						Model settings
					</ContextMenuItem>
					{canToggleModelEnabled ? (
						<ContextMenuItem
							onClick={(event) => {
								event.preventDefault();
								onUpdateModelSettingsForModel?.(modelId, {
									enabled: !modelEnabled,
								});
							}}
						>
							{modelEnabled ? (
								<PowerOff className="h-4 w-4" />
							) : (
								<Power className="h-4 w-4" />
							)}
							{modelEnabled ? "Disable model" : "Enable model"}
						</ContextMenuItem>
					) : null}
					{canReorderModels ? (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem
								disabled={!canMoveLeft}
								onClick={(event) => {
									event.preventDefault();
									moveSelectedModelToIndex(modelId, 0);
								}}
							>
								<ChevronsLeft className="h-4 w-4" />
								Move to front
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!canMoveLeft}
								onClick={(event) => {
									event.preventDefault();
									moveSelectedModelToIndex(
										modelId,
										selectedModelIndex - 1,
									);
								}}
							>
								<ArrowLeft className="h-4 w-4" />
								Move left
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!canMoveRight}
								onClick={(event) => {
									event.preventDefault();
									moveSelectedModelToIndex(
										modelId,
										selectedModelIndex + 1,
									);
								}}
							>
								<ArrowRight className="h-4 w-4" />
								Move right
							</ContextMenuItem>
						</>
					) : null}
					{canRemoveModel ? (
						<ContextMenuSeparator />
					) : null}
					{canRemoveModel ? (
						<ContextMenuItem
							onClick={(event) => {
								event.preventDefault();
								handleRemoveModel(modelId);
							}}
						>
							<X className="h-4 w-4" />
							Remove
						</ContextMenuItem>
					) : null}
					{canRemoveModel ? (
						<ContextMenuItem
							onClick={(event) => {
								event.preventDefault();
								onRemoveAllModels?.();
							}}
							variant="destructive"
						>
							<Trash2 className="h-4 w-4" />
							Remove all
						</ContextMenuItem>
					) : null}
				</ContextMenuContent>
			</ContextMenu>
		);
	};
	const normalizeSearch = (value: string) =>
		value
			.toLowerCase()
			.replace(/[\s._-]+/g, " ")
			.replace(/[^a-z0-9 ]/g, "")
			.trim();
	const buildSearchKeywords = (option: ModelOption) => {
		const modelId = option.modelId;
		const dotted = modelId.replace(/-/g, ".");
		const dashed = modelId.replace(/\./g, "-");
		const compact = modelId.replace(/[\s._-]+/g, "");
		return Array.from(
			new Set(
				[
					option.modelId,
					option.label,
					option.orgId,
					dotted,
					dashed,
					compact,
					normalizeSearch(modelId),
					normalizeSearch(option.label),
				].filter(Boolean)
			)
		);
	};
	const computeModelSearchScore = (option: ModelOption, query: string) => {
		const normalizedQuery = normalizeSearch(query);
		if (!normalizedQuery) return 0;

		const modelId = normalizeSearch(option.modelId);
		const label = normalizeSearch(option.label);
		const orgName = normalizeSearch(option.orgName);
		const orgId = normalizeSearch(option.orgId);
		const providerIds = option.providerIds.map((providerId) =>
			normalizeSearch(providerId),
		);
		const providerNames = option.providerNames.map((providerName) =>
			normalizeSearch(providerName),
		);
		const terms = normalizedQuery.split(/\s+/).filter(Boolean);
		const haystack = [modelId, label, orgName, orgId, ...providerIds, ...providerNames]
			.join(" ")
			.trim();
		if (terms.length > 1 && !terms.every((term) => haystack.includes(term))) {
			return 0;
		}
		if (terms.length === 1 && !haystack.includes(terms[0])) {
			return 0;
		}

		let score = 0;
		if (modelId === normalizedQuery) score += 2200;
		if (label === normalizedQuery) score += 2000;
		if (modelId.startsWith(normalizedQuery)) score += 1400;
		if (label.startsWith(normalizedQuery)) score += 1300;
		if (orgName.startsWith(normalizedQuery) || orgId.startsWith(normalizedQuery)) {
			score += 920;
		}
		if (
			providerNames.some((providerName) =>
				providerName.startsWith(normalizedQuery),
			)
		) {
			score += 900;
		}
		if (
			providerIds.some((providerId) => providerId.startsWith(normalizedQuery))
		) {
			score += 880;
		}
		if (modelId.includes(normalizedQuery)) score += 760;
		if (label.includes(normalizedQuery)) score += 700;
		if (orgName.includes(normalizedQuery) || orgId.includes(normalizedQuery)) {
			score += 520;
		}
		if (
			providerNames.some((providerName) =>
				providerName.includes(normalizedQuery),
			) ||
			providerIds.some((providerId) => providerId.includes(normalizedQuery))
		) {
			score += 460;
		}

		for (const term of terms) {
			if (modelId.startsWith(term)) score += 220;
			if (label.startsWith(term)) score += 190;
			if (modelId.includes(term)) score += 130;
			if (label.includes(term)) score += 120;
			if (orgName.includes(term) || orgId.includes(term)) score += 100;
			if (
				providerNames.some((providerName) => providerName.includes(term)) ||
				providerIds.some((providerId) => providerId.includes(term))
			) {
				score += 90;
			}
		}

		if (option.gatewayStatus === "active") score += 10;
		return score;
	};
	const normalizedModelSearchValue = useMemo(
		() => normalizeSearch(modelSearchValue),
		[modelSearchValue],
	);
	const hasModelSearchValue = normalizedModelSearchValue.length > 0;
	const searchRanking = useMemo(() => {
		if (!hasModelSearchValue) {
			return { total: 0, results: [] as Array<{ option: ModelOption; score: number }> };
		}
		const scored = uniqueModelOptions
			.map((option) => ({
				option,
				score: computeModelSearchScore(option, normalizedModelSearchValue),
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if (a.option.gatewayStatus !== b.option.gatewayStatus) {
					return a.option.gatewayStatus === "active" ? -1 : 1;
				}
				return compareByReleaseDateDesc(a.option, b.option);
			});
		return { total: scored.length, results: scored.slice(0, 25) };
	}, [hasModelSearchValue, normalizedModelSearchValue, uniqueModelOptions]);
	const searchResultTotalCount = searchRanking.total;
	const rankedSearchResults = searchRanking.results;
	const toggleFavoriteModel = (modelId: string) => {
		setFavoriteModelIdSet((prev) => {
			const normalizedId = normalizeFavoriteModelId(modelId);
			const next = new Set(prev);
			if (next.has(normalizedId)) {
				next.delete(normalizedId);
			} else {
				next.add(normalizedId);
			}
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
					JSON.stringify(Array.from(next)),
				);
			}
			return next;
		});
	};
	const isModelSelected = (modelId: string) =>
		activeThread?.modelId === modelId || compareModelIdSet.has(modelId);
	const isModelDisabledForPicker = (
		option: ModelOption,
		withComingSoonBadge = false,
	) =>
		withComingSoonBadge ||
		option.gatewayStatus === "inactive" ||
		!isModelCapabilityCompatible(option.modelId);
	const renderModelOptionContent = (
		option: ModelOption,
		withComingSoonBadge = false,
	) => (
		<div className="flex min-w-0 flex-1 items-center gap-1.5">
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<span className="truncate text-sm font-medium">
					{option.orgName}: {option.label.split(":")[0]}
				</span>
				{option.modelId.includes(":") ? (
					<Badge {...getModelBadgeProps(option.modelId.split(":")[1])}>
						{option.modelId.split(":")[1].replace(/^free$/, "Free")}
					</Badge>
				) : null}
				{isModelSelected(option.modelId) ? (
					<CircleCheck className="h-4 w-4 shrink-0 text-foreground/70" />
				) : null}
				{withComingSoonBadge ? (
					<Badge
						variant="outline"
						className="h-4 rounded-full border-dashed px-1.5 text-[10px] font-medium"
					>
						Coming soon
					</Badge>
				) : null}
				{!isModelCapabilityCompatible(option.modelId) ? (
					<Badge variant="outline" className="text-[10px] px-1.5 py-0">
						{getIncompatibleCapabilityLabel(option.modelId)} only
					</Badge>
				) : null}
			</div>
			<div className="flex shrink-0 items-center">
				<button
					type="button"
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
						favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
							? "text-amber-500 hover:bg-amber-500/10"
							: "text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						toggleFavoriteModel(option.modelId);
					}}
					aria-label={
						favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
							? `Remove ${option.label} from favorites`
							: `Add ${option.label} to favorites`
					}
					title={
						favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
							? "Remove from favorites"
							: "Add to favorites"
					}
				>
					<Star
						className="h-4 w-4"
						fill={
							favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
								? "currentColor"
								: "none"
						}
					/>
				</button>
			</div>
		</div>
	);
	const renderModelOptionItem = (
		option: ModelOption,
		options?: { withComingSoonBadge?: boolean },
	) => {
		const withComingSoonBadge = options?.withComingSoonBadge ?? false;
		const isDisabled = isModelDisabledForPicker(option, withComingSoonBadge);
		return (
			<ModelSelectorItem
				key={option.modelId}
				value={option.modelId}
				onSelect={() => {
					handleModelSelect(option.modelId);
				}}
				keywords={buildSearchKeywords(option)}
				className={cn(
					"flex min-h-8 items-center gap-2 py-1",
					isDisabled && "opacity-60",
					isModelSelected(option.modelId) && "bg-foreground/5",
				)}
				disabled={isDisabled}
			>
				<Logo
					id={option.orgId}
					alt={option.orgId}
					width={16}
					height={16}
					className={cn(
						"shrink-0 rounded-none",
						option.gatewayStatus === "inactive" && "grayscale",
					)}
				/>
				{renderModelOptionContent(option, withComingSoonBadge)}
			</ModelSelectorItem>
		);
	};

	return (
		<header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
			<div className="flex min-w-0 flex-1 items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="group -ml-1"
							onClick={toggleSidebar}
							aria-label="Toggle sidebar"
						>
							<ChevronRight
								className={`h-5 w-5 transition-transform duration-200 ${
									sidebarState === "expanded"
										? "rotate-180 group-hover:-translate-x-1"
										: "group-hover:translate-x-1"
								}`}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side={sidebarState === "collapsed" ? "right" : "bottom"}
						align="center"
						sideOffset={8}
					>
						Toggle sidebar
					</TooltipContent>
				</Tooltip>
				{selectedModelIds.length > 0 ? (
					<ScrollArea
						scrollBarOrientation="horizontal"
						className="h-8 min-w-0 max-w-[min(58vw,520px)] overflow-visible lg:max-w-[760px] xl:max-w-[880px] [&_[data-orientation=horizontal][data-slot=scroll-area-scrollbar]]:translate-y-2"
						viewportClassName="h-8 overscroll-x-contain"
					>
						<div className="flex h-8 w-max items-center gap-1 pr-2">
							{selectedModelIds.map(renderSelectedModelChip)}
						</div>
					</ScrollArea>
				) : null}
				<ModelSelector
					open={modelPickerOpen}
					onOpenChange={handleModelPickerDialogOpenChange}
				>
					<ModelSelectorTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Add model"
							title="Add model (Ctrl/Cmd+Shift+M)"
							className={cn(
								"h-8 gap-1.5",
								selectedModelIds.length === 0 ? "px-2 text-xs" : "w-8 px-0",
							)}
						>
							<Plus className="h-4 w-4" />
							{selectedModelIds.length === 0 ? (
								<span className="truncate text-xs">Add Model</span>
							) : null}
						</Button>
					</ModelSelectorTrigger>
					<ModelSelectorContent
						title="Select a model"
						className="w-[min(92vw,560px)] max-w-none sm:max-w-none"
						commandProps={{ shouldFilter: false }}
					>
						<ModelSelectorInput
							ref={modelSearchInputRef}
							data-chat-model-selector-search="true"
							autoFocus
							placeholder="Search models..."
							value={modelSearchValue}
							onValueChange={setModelSearchValue}
						/>
						<div className="flex items-center gap-1 border-b border-border px-3 py-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => toggleQuickFilter("free")}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs",
									quickFilters.free &&
										"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
								)}
							>
								Free
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => toggleQuickFilter("new")}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs",
									quickFilters.new &&
										"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
								)}
							>
								New
							</Button>
						</div>
						<ModelSelectorList className="max-h-[70vh]" viewportClassName="p-3">
							<ModelSelectorEmpty>
								No models found.
							</ModelSelectorEmpty>
							{hasModelSearchValue ? (
								<ModelSelectorGroup
									heading={`Results (${Math.min(25, searchResultTotalCount)}${searchResultTotalCount > 25 ? ` of ${searchResultTotalCount}` : ""})`}
									className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
								>
									{rankedSearchResults.map(({ option }) =>
										renderModelOptionItem(option, {
											withComingSoonBadge: option.gatewayStatus === "inactive",
										}),
									)}
								</ModelSelectorGroup>
							) : null}
							{!hasModelSearchValue && favoriteActiveOptions.length > 0 && (
								<ModelSelectorGroup
									heading="Favourites"
									className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
								>
									{favoriteActiveOptions.map((option) =>
										renderModelOptionItem(option),
									)}
								</ModelSelectorGroup>
							)}
							{!hasModelSearchValue &&
								groupedActiveOptions.map((group, index) => (
									<ModelSelectorGroup
										key={`active-${group.heading}-${index}`}
										heading={group.heading}
										className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
									>
										{group.items.map((option) =>
											renderModelOptionItem(option),
										)}
									</ModelSelectorGroup>
								))}
							{!hasModelSearchValue && comingSoonCount > 0 && (
								<>
									<ModelSelectorSeparator />
									{groupedComingSoonOptions.map((group, index) => (
										<ModelSelectorGroup
											key={`coming-soon-${group.heading}-${index}`}
											heading={`Coming soon · ${group.heading}`}
											className="pb-2"
										>
											{group.items.map((option) =>
												renderModelOptionItem(option, {
													withComingSoonBadge: true,
												}),
											)}
										</ModelSelectorGroup>
									))}
								</>
							)}
						</ModelSelectorList>
					</ModelSelectorContent>
				</ModelSelector>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{showResponseLayoutControl ? (
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger render={<Button
										variant="outline"
										size="sm"
										className="h-8 gap-1.5 rounded-md bg-muted/40 px-2.5 text-xs font-medium shadow-none"
										aria-label="Response layout" />}>

										{responseLayout === "side-by-side" ? (
											<Columns2 className="h-4 w-4" />
										) : (
											<List className="h-4 w-4" />
										)}
										<span className="hidden xl:inline">
											{responseLayout === "side-by-side"
												? "Side by side"
												: "Sequential"}
										</span>
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />

								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent className="max-w-64 text-left">
								<div className="grid gap-1">
									<p className="text-xs font-medium">
										{responseLayout === "side-by-side"
											? "Side-by-side responses"
											: "Sequential responses"}
									</p>
									<p className="text-xs text-muted-foreground">
										{responseLayout === "side-by-side"
											? "Show each model in its own column for direct comparison."
											: "Stack every model response in the chat timeline."}
									</p>
								</div>
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" sideOffset={8} className="w-72">
							<DropdownMenuItem
								onClick={() => onResponseLayoutChange("sequential")}
								className="items-start gap-2"
							>
								<List className="mt-0.5 h-4 w-4 text-muted-foreground" />
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span>Sequential</span>
									<span className="whitespace-normal text-xs leading-4 text-muted-foreground">
										Responses appear one after another.
									</span>
								</span>
								{responseLayout === "sequential" ? (
									<Check className="mt-0.5 h-4 w-4" />
								) : null}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => onResponseLayoutChange("side-by-side")}
								className="items-start gap-2"
							>
								<Columns2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span>Side by side</span>
									<span className="whitespace-normal text-xs leading-4 text-muted-foreground">
										Responses sit in model columns.
									</span>
								</span>
								{responseLayout === "side-by-side" ? (
									<Check className="mt-0.5 h-4 w-4" />
								) : null}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={temporaryMode ? "secondary" : "ghost"}
							size="icon"
							onClick={onToggleTemporaryMode}
							aria-label={
								temporaryMode
									? "Turn off temporary chat"
									: "Turn on temporary chat"
							}
						>
							<MessageCircleDashed className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						Temporary chat (Ctrl/Cmd+Shift+U)
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onSettingsOpenChange(true)}
							aria-label="Open chat settings"
						>
							<Settings className="h-5 w-5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Settings</TooltipContent>
				</Tooltip>
				<Dialog open={settingsOpen} onOpenChange={onSettingsOpenChange}>
					<DialogContent className="overflow-hidden p-0 md:max-h-[520px] md:max-w-[760px] lg:max-w-[820px]">
						<DialogTitle className="sr-only">Settings</DialogTitle>
						<DialogDescription className="sr-only">
							Chat settings and diagnostics.
						</DialogDescription>
						<div className="flex h-[520px] flex-1 overflow-hidden">
							<div className="hidden w-52 shrink-0 flex-col border-r border-border p-2 md:flex">
								<Button
									variant={
										settingsTab === "personalization"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() =>
										setSettingsTab("personalization")
									}
								>
									<Paintbrush className="h-4 w-4" />
									Personalization
								</Button>
								<Button
									variant={
										settingsTab === "data-controls"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() => {
										setSettingsTab("data-controls");
										setImportResult(null);
									}}
								>
									<Database className="h-4 w-4" />
									Data Controls
								</Button>
								<Button
									variant={
										settingsTab === "shortcuts"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() => setSettingsTab("shortcuts")}
								>
									<Keyboard className="h-4 w-4" />
									Shortcuts
								</Button>
								{isAdmin && (
									<Button
										variant={
											settingsTab === "admin"
												? "secondary"
												: "ghost"
										}
										className="w-full justify-start gap-2"
										onClick={() => setSettingsTab("admin")}
									>
										<Shield className="h-4 w-4" />
										Admin
									</Button>
								)}
							</div>
							<div className="flex flex-1 flex-col overflow-hidden">
								<div className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
									<Button
										size="sm"
										variant={
											settingsTab === "personalization"
												? "secondary"
												: "ghost"
										}
										onClick={() =>
											setSettingsTab("personalization")
										}
									>
										Personalization
									</Button>
									<Button
										size="sm"
										variant={
											settingsTab === "data-controls"
												? "secondary"
												: "ghost"
										}
										onClick={() => {
											setSettingsTab("data-controls");
											setImportResult(null);
										}}
									>
										Data Controls
									</Button>
									<Button
										size="sm"
										variant={
											settingsTab === "shortcuts"
												? "secondary"
												: "ghost"
										}
										onClick={() => setSettingsTab("shortcuts")}
									>
										Shortcuts
									</Button>
									{isAdmin && (
										<Button
											size="sm"
											variant={
												settingsTab === "admin"
													? "secondary"
													: "ghost"
											}
											onClick={() =>
												setSettingsTab("admin")
											}
										>
											Admin
										</Button>
									)}
								</div>
								<div className="flex-1 overflow-y-auto p-4">
									{settingsTab === "personalization" && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Personalization
												</p>
												<p className="text-xs text-muted-foreground">
													Stored locally and applied
													to your system prompt.
												</p>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-name">
													Name
												</Label>
												<Input
													id="personal-name"
													value={personalization.name}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																name: event
																	.target
																	.value,
															}
														)
													}
													placeholder="Jane Doe"
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-role">
													Role
												</Label>
												<Input
													id="personal-role"
													value={personalization.role}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																role: event
																	.target
																	.value,
															}
														)
													}
													placeholder="Product manager"
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-notes">
													Notes
												</Label>
												<Textarea
													id="personal-notes"
													value={
														personalization.notes
													}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																notes: event
																	.target
																	.value,
															}
														)
													}
													placeholder="I like short, actionable responses."
													rows={3}
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="accent-color">
													Accent color
												</Label>
												<Select
													value={
														selectedAccentSelectValue
													}
													onValueChange={
														handleAccentSelectValueChange
													}
												>
													<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
														<SelectTrigger
															id="accent-color"
															className="w-full sm:w-44"
														>
															<SelectValue placeholder="Select a color">
																<span className="flex items-center gap-2">
																	<AccentColorSwatch
																		unknown={
																			isCustomAccentSelected &&
																			!customAccentColor
																		}
																		color={
																			selectedAccentColor?.value ??
																			customAccentPickerValue
																		}
																	/>
																	{
																		selectedAccentColor?.label
																	}
																</span>
															</SelectValue>
														</SelectTrigger>
														{isCustomAccentSelected ? (
															<div className="flex min-w-0 flex-1 items-center gap-2">
																<Input
																	value={
																		customAccentColor ??
																		customAccentDraft
																	}
																	onChange={(
																		event
																	) =>
																		handleCustomAccentDraftChange(
																			event
																				.target
																				.value
																		)
																	}
																	onBlur={() => {
																		const normalizedValue =
																			normalizeHexColor(
																				customAccentDraft
																			);

																		setCustomAccentDraft(
																			normalizedValue ??
																				personalization.accentColor
																		);
																	}}
																	placeholder="#111111"
																	aria-label="Custom accent hex color"
																	className="min-w-0 flex-1 font-mono text-xs"
																/>
																<Popover>
																	<PopoverTrigger
																		asChild
																	>
																		<Button
																			type="button"
																			variant="outline"
																			size="icon"
																			aria-label="Choose custom accent color"
																			className="h-8 w-10 shrink-0 rounded-md"
																		>
																			<AccentColorSwatch
																				unknown={
																					!customAccentColor
																				}
																				color={
																					customAccentColor ??
																					customAccentPickerValue
																				}
																				className="h-4 w-4"
																			/>
																		</Button>
																	</PopoverTrigger>
																	<PopoverContent
																		align="end"
																		className="w-64 gap-3 p-3"
																	>
																		<PopoverHeader>
																			<PopoverTitle className="text-sm">
																				Custom accent
																			</PopoverTitle>
																		</PopoverHeader>
																		<ColorPicker
																			value={
																				customAccentPickerValue
																			}
																			onChange={
																				handleCustomAccentDraftChange
																			}
																		/>
																	</PopoverContent>
																</Popover>
															</div>
														) : null}
													</div>
													<SelectContent>
														{ACCENT_COLORS.map(
															(color) => (
																<SelectItem
																	key={
																		color.value
																	}
																	value={
																		color.value
																	}
																>
																	<span className="flex items-center gap-2">
																		<AccentColorSwatch
																			color={
																				color.value
																			}
																		/>
																		{
																			color.label
																		}
																	</span>
																</SelectItem>
															)
														)}
														<SelectItem
															value={
																CUSTOM_ACCENT_SELECT_VALUE
															}
														>
															<span className="flex items-center gap-2">
																<AccentColorSwatch
																	unknown={
																		!customAccentColor
																	}
																	color={
																		customAccentColor ??
																		undefined
																	}
																/>
																Custom
															</span>
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
									{settingsTab === "data-controls" && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Data Controls
												</p>
												<p className="text-xs text-muted-foreground">
													Import and export chat data
													stored locally in your browser.
												</p>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														Export chats
													</p>
													<p className="text-xs text-muted-foreground">
														Download all chats stored in this browser.
													</p>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={onExportChats}
												>
													Export
												</Button>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														Import chats
													</p>
													<p className="text-xs text-muted-foreground">
														Upload a previously exported chat file.
													</p>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => {
														const input = document.createElement('input');
														input.type = 'file';
														input.accept = '.json';
														input.onchange = async (event) => {
															const file = (event.target as HTMLInputElement).files?.[0];
															if (!file) return;

															setImportResult(null); // Clear previous result

															try {
																const text = await file.text();
																const data = JSON.parse(text);

																if (!data.chats || !Array.isArray(data.chats)) {
																	throw new Error("Invalid file format. Expected { chats: [...] }");
																}

																const { upsertChat } = await import("@/lib/indexeddb/chats");
																const chats: any[] = data.chats;
																let importedCount = 0;
																let skippedCount = 0;
																const skippedReasons: string[] = [];

																// Validate and import each chat individually
																for (let i = 0; i < chats.length; i++) {
																	const chat = chats[i];
																	let isValid = true;
																	const reasons: string[] = [];

																	if (!chat.id || typeof chat.id !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid id');
																	}
																	if (!chat.title || typeof chat.title !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid title');
																	}
																	if (!chat.modelId || typeof chat.modelId !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid modelId');
																	}
																	if (!chat.createdAt || typeof chat.createdAt !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid createdAt');
																	}
																	if (!chat.updatedAt || typeof chat.updatedAt !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid updatedAt');
																	}
																	if (!Array.isArray(chat.messages)) {
																		isValid = false;
																		reasons.push('missing or invalid messages array');
																	}
																	if (!chat.settings || typeof chat.settings !== 'object') {
																		isValid = false;
																		reasons.push('missing or invalid settings');
																	}

																	if (isValid) {
																		try {
																			await upsertChat(chat);
																			importedCount++;
																		} catch (error) {
																			skippedCount++;
																			skippedReasons.push(`Chat ${i + 1}: Failed to save - ${error instanceof Error ? error.message : 'Unknown error'}`);
																		}
																	} else {
																		skippedCount++;
																		skippedReasons.push(`Chat ${i + 1}: ${reasons.join(', ')}`);
																	}
																}

																if (importedCount > 0) {
																	setImportResult({
																		message: `Successfully imported ${importedCount} chats${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
																		type: "success"
																	});
																	// Refresh the page to show imported chats
																	setTimeout(() => window.location.reload(), 1500);
																} else if (skippedCount > 0) {
																	setImportResult({
																		message: `All ${skippedCount} chats were invalid and skipped`,
																		type: "error"
																	});
																} else {
																	setImportResult({
																		message: "No chats found in file",
																		type: "info"
																	});
																}

																if (skippedCount > 0) {
																	console.warn("Skipped chats:", skippedReasons);
																}
															} catch (error) {
																console.error("Import error:", error);
																setImportResult({
																	message: `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
																	type: "error"
																});
															}
														};
														input.click();
													}}
												>
													Import
												</Button>
											</div>
											{importResult && (
												<div className={`rounded-lg border px-3 py-3 ${
													importResult.type === 'success'
														? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
														: importResult.type === 'error'
														? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
														: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
												}`}>
													<p className="text-sm font-medium">
														{importResult.message}
													</p>
												</div>
											)}
										</div>
									)}
									{settingsTab === "shortcuts" && (
										<div className="grid gap-4">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Keyboard shortcuts
												</p>
												<p className="text-xs text-muted-foreground">
													Fast actions for chat,
													models, and the composer.
												</p>
											</div>
											<div className="rounded-xl border border-border bg-card p-3">
												<ChatShortcutReference />
											</div>
										</div>
									)}
									{settingsTab === "admin" && isAdmin && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Admin
												</p>
												<p className="text-xs text-muted-foreground">
													Diagnostic settings for
													debugging gateway issues.
												</p>
											</div>
											<div className="grid gap-3 rounded-lg border border-border px-3 py-3">
												<div className="grid gap-1">
													<p className="text-sm font-medium">
														API target
													</p>
													<p className="text-xs text-muted-foreground">
														Choose the gateway base
														URL used by chat
														requests.
													</p>
												</div>
												<div className="grid gap-2">
													<Label htmlFor="api-target">
														Environment
													</Label>
													<Select
														value={apiTargetValue}
														onValueChange={(value) => {
															if (
																value ===
																CUSTOM_API_SELECT_VALUE
															) {
																setApiTargetValueOverride(
																	CUSTOM_API_SELECT_VALUE,
																);
																onApiTargetChange("custom");
																return;
															}
															setApiTargetValueOverride(
																null,
															);
															onApiTargetChange(
																value as ChatApiTarget,
															);
															if (value !== "custom") {
																onBaseUrlChange("");
															}
														}}
													>
														<SelectTrigger id="api-target">
															<SelectValue placeholder="Select API target" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="default">
																App default
															</SelectItem>
															<SelectItem value="public">
																Public API
															</SelectItem>
															<SelectItem
																value="local"
															>
																Local API
															</SelectItem>
															<SelectItem
																value={
																	CUSTOM_API_SELECT_VALUE
																}
															>
																Custom
															</SelectItem>
														</SelectContent>
													</Select>
												</div>
												<div className="grid gap-2">
													<Label htmlFor="api-base-url">
														Base URL
													</Label>
													<Input
														id="api-base-url"
														value={
															apiTarget === "custom"
																? baseUrl
																: effectiveBaseUrl
														}
														onChange={(event) => {
															setApiTargetValueOverride(
																null,
															);
															onApiTargetChange("custom");
															onBaseUrlChange(
																event.target.value,
															);
														}}
														placeholder={
															LOCAL_CHAT_API_BASE_URL
														}
														disabled={
															apiTarget !== "custom"
														}
														className="font-mono text-xs"
													/>
													<p className="text-xs text-muted-foreground">
														Current target:{" "}
														<span className="font-mono">
															{effectiveBaseUrl}
														</span>
													</p>
												</div>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium">
														Debug mode
													</p>
													<p className="text-xs text-muted-foreground">
														Send `x-gateway-debug`
														headers.
													</p>
												</div>
												<Switch
													checked={debugEnabled}
													onCheckedChange={
														onDebugChange
													}
												/>
											</div>
										</div>
									)}
								</div>
								<div className="border-t border-border px-4 py-3">
									<div className="flex justify-end">
										<Button onClick={onSaveSettings}>
											Save
										</Button>
									</div>
								</div>
							</div>
						</div>
						<div className="flex justify-end">
							<Button onClick={onSaveSettings}>Save</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</header>
	);
}
