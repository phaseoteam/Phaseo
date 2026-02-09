"use client";

import { useMemo, useState } from "react";
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
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type { ChatThread, UnifiedChatEndpoint } from "@/lib/indexeddb/chats";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Cpu,
	Database,
	MessageCircleDashed,
	Paintbrush,
	Plus,
	Settings,
	Shield,
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
	featured: ModelOption[];
	grouped: Map<string, ModelOption[]>;
	comingSoon: Map<string, ModelOption[]>;
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

const MAX_PROVIDER_LOGOS = 8;
const BASE_URL_OPTIONS = [BASE_URL];
const CAPABILITY_LABELS: Record<UnifiedChatEndpoint, string> = {
	responses: "Text",
	"images.generations": "Image",
	"video.generation": "Video",
	"music.generate": "Music",
	"audio.speech": "Audio",
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
	apiKey: string;
	baseUrl: string;
	onApiKeyChange: (value: string) => void;
	onBaseUrlChange: (value: string) => void;
	onSaveSettings: () => void;
	personalization: PersonalizationSettings;
	onPersonalizationChange: (next: PersonalizationSettings) => void;
	onExportChats: () => void;
	isAdmin: boolean;
	debugEnabled: boolean;
	onDebugChange: (value: boolean) => void;
	allowModelCompare?: boolean;
	compareModelIds?: string[];
	onCompareModelIdsChange?: (ids: string[]) => void;
	onRemoveModel?: (modelId: string) => void;
	onRemoveAllModels?: () => void;
	onOpenModelSettingsForModel?: (modelId: string) => void;
	modelDisplayNameById?: Record<string, string>;
	modelEnabledById?: Record<string, boolean>;
	modelCapabilitiesById?: Record<string, UnifiedChatEndpoint[]>;
	modelSupportsAudioInputById?: Record<string, boolean>;
	requiredCapability?: UnifiedChatEndpoint | null;
	requireAudioInput?: boolean;
};

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
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
	apiKey,
	baseUrl,
	onApiKeyChange,
	onBaseUrlChange,
	onSaveSettings,
	personalization,
	onPersonalizationChange,
	onExportChats,
	isAdmin,
	debugEnabled,
	onDebugChange,
	allowModelCompare = false,
	compareModelIds = [],
	onCompareModelIdsChange,
	onRemoveModel,
	onRemoveAllModels,
	onOpenModelSettingsForModel,
	modelDisplayNameById,
	modelEnabledById,
	modelCapabilitiesById,
	modelSupportsAudioInputById,
	requiredCapability = null,
	requireAudioInput = false,
}: ChatHeaderProps) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const [settingsTab, setSettingsTab] = useState<
		"general" | "personalization" | "data-controls" | "admin"
	>("general");
	const [baseUrlOpen, setBaseUrlOpen] = useState(false);
	const [baseUrlQuery, setBaseUrlQuery] = useState(baseUrl);
	const [importResult, setImportResult] = useState<{
		message: string;
		type: "success" | "error" | "info";
	} | null>(null);
	const groupedEntries = useMemo(
		() => Array.from(modelOptions.grouped.entries()),
		[modelOptions.grouped]
	);
	const comingSoonEntries = useMemo(
		() => Array.from(modelOptions.comingSoon.entries()),
		[modelOptions.comingSoon]
	);
	const comingSoonCount = useMemo(
		() =>
			comingSoonEntries.reduce(
				(total, [, list]) => total + list.length,
				0
			),
		[comingSoonEntries]
	);
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
	const selectedModelPreview = selectedModelIds.slice(0, 5);
	const hiddenSelectedCount = Math.max(
		0,
		selectedModelIds.length - selectedModelPreview.length,
	);
	const hiddenSelectedModelIds = useMemo(
		() => selectedModelIds.slice(selectedModelPreview.length),
		[selectedModelIds, selectedModelPreview.length],
	);
	const compareModelIdSet = useMemo(
		() =>
			new Set(
				selectedModelIds.filter((id) => id !== activeThread?.modelId),
			),
		[selectedModelIds, activeThread?.modelId],
	);
	const selectedModelLabelById = useMemo(() => {
		const labelById = new Map<string, string>();
		for (const option of modelOptions.featured) {
			labelById.set(option.modelId, option.label);
		}
		for (const list of modelOptions.grouped.values()) {
			for (const option of list) {
				labelById.set(option.modelId, option.label);
			}
		}
		for (const list of modelOptions.comingSoon.values()) {
			for (const option of list) {
				labelById.set(option.modelId, option.label);
			}
		}
		return labelById;
	}, [modelOptions.featured, modelOptions.grouped, modelOptions.comingSoon]);
	const selectedModelOrgIdById = useMemo(() => {
		const orgIdById = new Map<string, string>();
		for (const option of modelOptions.featured) {
			orgIdById.set(option.modelId, option.orgId);
		}
		for (const list of modelOptions.grouped.values()) {
			for (const option of list) {
				orgIdById.set(option.modelId, option.orgId);
			}
		}
		for (const list of modelOptions.comingSoon.values()) {
			for (const option of list) {
				orgIdById.set(option.modelId, option.orgId);
			}
		}
		return orgIdById;
	}, [modelOptions.featured, modelOptions.grouped, modelOptions.comingSoon]);
	const requiredCapabilityLabel = requiredCapability
		? CAPABILITY_LABELS[requiredCapability] ?? "Text"
		: null;
	const requiredFilterLabel = useMemo(() => {
		const labels: string[] = [];
		if (requiredCapabilityLabel) {
			labels.push(requiredCapabilityLabel.toLowerCase());
		}
		if (requireAudioInput) {
			labels.push("audio input");
		}
		if (!labels.length) return null;
		return labels.join(" + ");
	}, [requiredCapabilityLabel, requireAudioInput]);
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
			return;
		}
		if (activeThread.modelId === modelId) {
			if (selectedModelIds.length > 0) {
				onRemoveModel?.(modelId);
			}
			return;
		}
		if (!onCompareModelIdsChange) {
			onUpdateModel(modelId);
			return;
		}
		const nextSet = new Set(compareModelIdSet);
		if (nextSet.has(modelId)) {
			nextSet.delete(modelId);
		} else {
			nextSet.add(modelId);
		}
		onCompareModelIdsChange(Array.from(nextSet));
	};
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
	const renderSelectedModelChip = (modelId: string) => {
		const orgId = selectedModelOrgIdById.get(modelId) ?? getOrgId(modelId);
		const baseLabel = (selectedModelLabelById.get(modelId) ?? modelId).split(
			":",
		)[0];
		const label = modelDisplayNameById?.[modelId]?.trim() || baseLabel;
		const modelEnabled = modelEnabledById?.[modelId] !== false;
		const canRemoveModel = Boolean(onRemoveModel);
		return (
			<div key={modelId} className="relative shrink-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => handleOpenModelSettings(modelId)}
					className={cn(
						"h-8 max-w-[220px] gap-1.5 pl-2",
						!modelEnabled && "opacity-55",
						canRemoveModel ? "pr-7" : "pr-2",
					)}
				>
					<Logo
						id={orgId}
						alt={label}
						width={14}
						height={14}
						className="shrink-0 rounded"
					/>
					<span className="truncate text-xs">{label}</span>
				</Button>
				{canRemoveModel ? (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									handleRemoveModel(modelId);
								}}
								aria-label={`Remove ${label}`}
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem
								onClick={(event) => {
									event.preventDefault();
									handleRemoveModel(modelId);
								}}
							>
								Remove
							</ContextMenuItem>
							<ContextMenuItem
								onClick={(event) => {
									event.preventDefault();
									onRemoveAllModels?.();
								}}
								className="text-destructive focus:text-destructive"
							>
								Remove all
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				) : null}
			</div>
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
	const availableBaseUrls = useMemo(() => {
		const options = new Set<string>();
		BASE_URL_OPTIONS.forEach((value) => options.add(value));
		if (baseUrl) options.add(baseUrl);
		return Array.from(options).filter(Boolean);
	}, [baseUrl]);
	const formatReleaseDate = (value: string | null) => {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};
	const renderProviderLogos = (option: ModelOption) => {
		const providerNameById = new Map(
			option.providerIds.map((providerId, index) => [
				providerId,
				option.providerNames[index] ?? formatOrgLabel(providerId),
			])
		);
		const providers = [...option.providerIds].sort((a, b) => {
			const aActive = Boolean(option.providerAvailability?.[a]);
			const bActive = Boolean(option.providerAvailability?.[b]);
			if (aActive !== bActive) return aActive ? -1 : 1;
			const aName = providerNameById.get(a) ?? a;
			const bName = providerNameById.get(b) ?? b;
			return aName.localeCompare(bName);
		});
		const visible = providers.slice(0, MAX_PROVIDER_LOGOS);
		const hiddenCount = Math.max(0, providers.length - visible.length);
		return (
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<div className="flex items-center">
					{visible.map((providerId) => (
						<Logo
							key={providerId}
							id={providerId}
							alt={providerId}
							width={18}
							height={18}
							className={cn(
								"shrink-0",
								option.providerAvailability?.[providerId]
									? null
									: "grayscale opacity-60"
							)}
						/>
					))}
				</div>
				{hiddenCount > 0 && (
					<span className="pl-2">+{hiddenCount}</span>
				)}
			</div>
		);
	};

	return (
		<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="group -ml-1"
							onClick={toggleSidebar}
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
					<TooltipContent>Toggle sidebar</TooltipContent>
				</Tooltip>
				{selectedModelIds.length > 0 ? (
					<div className="flex max-w-[min(60vw,520px)] items-center gap-1 overflow-x-auto lg:max-w-[760px] xl:max-w-[880px]">
						{selectedModelPreview.map(renderSelectedModelChip)}
						{hiddenSelectedCount > 0 ? (
							<HoverCard openDelay={100} closeDelay={120}>
								<HoverCardTrigger asChild>
									<Badge
										variant="secondary"
										className="h-5 cursor-default rounded-full px-1.5 text-[10px]"
									>
										+{hiddenSelectedCount}
									</Badge>
								</HoverCardTrigger>
								<HoverCardContent
									side="bottom"
									align="start"
									className="w-[min(86vw,540px)] p-2"
								>
									<div className="flex max-h-[280px] flex-wrap items-center gap-1 overflow-auto pr-1">
										{hiddenSelectedModelIds.map(
											renderSelectedModelChip,
										)}
									</div>
								</HoverCardContent>
							</HoverCard>
						) : null}
					</div>
				) : null}
				<ModelSelector
					open={modelPickerOpen}
					onOpenChange={onModelPickerOpenChange}
				>
					<ModelSelectorTrigger asChild>
						<Button variant="ghost" size="icon" className="h-8 w-8">
							<Plus className="h-4 w-4" />
						</Button>
					</ModelSelectorTrigger>
					<ModelSelectorContent
						title="Select a model"
						className="w-[min(90vw,960px)] max-w-3xl"
					>
						<ModelSelectorInput placeholder="Search models..." />
						<ModelSelectorList className="max-h-[70vh] p-3">
							<ModelSelectorEmpty>
								No models found.
							</ModelSelectorEmpty>
							{requiredFilterLabel ? (
								<p className="px-2 pb-2 text-xs text-muted-foreground">
									Showing {requiredFilterLabel}-compatible
									models for this chat.
								</p>
							) : null}
							{modelOptions.featured.length > 0 && (
								<>
									<ModelSelectorGroup
										heading="Featured"
										className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
									>
									{modelOptions.featured.map((option) => (
										<ModelSelectorItem
											key={option.modelId}
											value={option.modelId}
											onSelect={() => {
												handleModelSelect(option.modelId);
											}}
											keywords={buildSearchKeywords(
												option
											)}
											className={cn(
												"flex items-center gap-3",
												!isModelCapabilityCompatible(
													option.modelId,
												) && "opacity-55",
												(activeThread?.modelId ===
													option.modelId ||
													compareModelIdSet.has(
														option.modelId,
													)) &&
													"bg-foreground/5"
											)}
											disabled={
												!isModelCapabilityCompatible(
													option.modelId,
												)
											}
										>
											<Logo
												id={option.orgId}
												alt={option.orgId}
												width={18}
												height={18}
												className="shrink-0"
											/>
												<div className="flex min-w-0 flex-1 items-center gap-2">
													<div className="flex items-center gap-2 min-w-0 flex-1">
														<span className="truncate text-sm font-medium">
															{
																option.label.split(
																	":"
																)[0]
															}
														</span>
												{option.modelId.includes(
													":"
												) && (
													<Badge
														{...getModelBadgeProps(
															option.modelId.split(
																":"
															)[1]
														)}
													>
														{option.modelId
															.split(":")[1]
															.replace(
																	/^free$/,
																	"Free"
																)}
													</Badge>
												)}
												{isNewModel(
													option.releaseDate
												) && (
													<Badge
														{...getModelBadgeProps(
															"new"
														)}
													>
														New
													</Badge>
												)}
												{(activeThread?.modelId ===
													option.modelId ||
													compareModelIdSet.has(
														option.modelId,
													)) && (
														<Badge
															variant="secondary"
															className="text-[10px] px-1.5 py-0"
														>
															Selected
														</Badge>
													)}
												{!isModelCapabilityCompatible(
													option.modelId,
												) && (
													<Badge
														variant="outline"
														className="text-[10px] px-1.5 py-0"
													>
														{getIncompatibleCapabilityLabel(
															option.modelId,
														)}{" "}
														only
													</Badge>
												)}
											</div>
											{renderProviderLogos(option)}
										</div>
									</ModelSelectorItem>
								))}
							</ModelSelectorGroup>
							<ModelSelectorSeparator />
						</>
					)}
											{groupedEntries.map(([orgId, options]) => {
													const orgLabel =
														options[0]?.orgName ??
														formatOrgLabel(orgId);
													return (
														<ModelSelectorGroup
															key={orgId}
															heading={orgLabel}
															className="pb-2"
														>
															{options.map((option) => (
																<ModelSelectorItem
																	key={option.modelId}
																	value={option.modelId}
																	onSelect={() => {
																		handleModelSelect(option.modelId);
																	}}
																	keywords={buildSearchKeywords(option)}
																	className={cn(
																		"flex items-center gap-3",
																		!isModelCapabilityCompatible(
																			option.modelId,
																		) &&
																			"opacity-55",
																		(activeThread?.modelId ===
																			option.modelId ||
																			compareModelIdSet.has(
																				option.modelId,
																			)) &&
																			"bg-foreground/5"
																	)}
																	disabled={
																		!isModelCapabilityCompatible(
																			option.modelId,
																		)
																	}
																>
																	<Logo
																		id={option.orgId}
																		alt={option.orgId}
																		width={18}
																		height={18}
																		className="shrink-0"
																	/>
												<div className="flex min-w-0 flex-1 items-center gap-2">
													<div className="flex items-center gap-2 min-w-0 flex-1">
														<span className="truncate text-sm font-medium">
															{
																option.label.split(
																	":"
																)[0]
															}
														</span>
												{option.modelId.includes(
													":"
												) && (
													<Badge
														{...getModelBadgeProps(
															option.modelId.split(
																":"
															)[1]
														)}
													>
														{option.modelId
															.split(":")[1]
															.replace(
																	/^free$/,
																	"Free"
																)}
													</Badge>
												)}
												{isNewModel(
													option.releaseDate
												) && (
													<Badge
														{...getModelBadgeProps(
															"new"
														)}
													>
														New
													</Badge>
												)}
												{(activeThread?.modelId ===
													option.modelId ||
													compareModelIdSet.has(
														option.modelId,
													)) && (
														<Badge
															variant="secondary"
															className="text-[10px] px-1.5 py-0"
														>
															Selected
														</Badge>
													)}
												{!isModelCapabilityCompatible(
													option.modelId,
												) && (
													<Badge
														variant="outline"
														className="text-[10px] px-1.5 py-0"
													>
														{getIncompatibleCapabilityLabel(
															option.modelId,
														)}{" "}
														only
													</Badge>
												)}
											</div>
											{renderProviderLogos(
												option
											)}
										</div>
									</ModelSelectorItem>
								))}
							</ModelSelectorGroup>
						);
					})}
					{comingSoonCount > 0 && (
								<>
									<ModelSelectorSeparator />
									{comingSoonEntries.map(
										([orgId, options]) => {
											const orgLabel =
												options[0]?.orgName ??
												formatOrgLabel(orgId);
											return (
												<ModelSelectorGroup
													key={`coming-soon-${orgId}`}
													heading={`${orgLabel} - Coming Soon`}
													className="pb-2"
												>
													{options.map((option) => (
														<ModelSelectorItem
															key={
																option.modelId
															}
															value={
																option.modelId
															}
															onSelect={() => {
																onUpdateModel(
																	option.modelId
																);
																onModelPickerOpenChange(
																	false
																);
															}}
															keywords={buildSearchKeywords(
																option
															)}
															className={cn(
																"flex items-center gap-3 opacity-60",
																activeThread?.modelId ===
																	option.modelId &&
																	"bg-foreground/5"
															)}
															disabled
														>
												<Logo
													id={
														option.orgId
													}
													alt={
														option.orgId
													}
													width={18}
													height={18}
													className="shrink-0 grayscale"
												/>
															<div className="flex min-w-0 flex-1 items-center gap-2">
																<div className="flex items-center gap-2 min-w-0 flex-1">
																	<span className="truncate text-sm font-medium">
																		{
																			option.label.split(
																				":"
																			)[0]
																		}
																	</span>
														{option.modelId.includes(
															":"
														) && (
															<Badge
																{...getModelBadgeProps(
																	option.modelId.split(
																		":"
																	)[1]
																)}
															>
																{option.modelId
																	.split(":")[1]
																	.replace(
																		/^free$/,
																		"Free"
																		)}
															</Badge>
														)}
														{isNewModel(
															option.releaseDate
														) && (
															<Badge
																{...getModelBadgeProps(
																	"new"
																)}
															>
																New
															</Badge>
														)}
													</div>
													{renderProviderLogos(
																	option
																)}
															</div>
														</ModelSelectorItem>
													))}
												</ModelSelectorGroup>
											);
										}
									)}
								</>
							)}
						</ModelSelectorList>
					</ModelSelectorContent>
				</ModelSelector>
			</div>
			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={temporaryMode ? "secondary" : "ghost"}
							size="icon"
							onClick={onToggleTemporaryMode}
						>
							<MessageCircleDashed className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Temporary chat</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onSettingsOpenChange(true)}
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
										settingsTab === "general"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() => setSettingsTab("general")}
								>
									<Settings className="h-4 w-4" />
									General
								</Button>
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
											settingsTab === "general"
												? "secondary"
												: "ghost"
										}
										onClick={() =>
											setSettingsTab("general")
										}
									>
										General
									</Button>
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
									{settingsTab === "general" && (
										<div className="grid gap-4">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													General
												</p>
												<p className="text-xs text-muted-foreground">
													Connection details for
													sending chat requests.
												</p>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="api-key">
													API key
												</Label>
												<Input
													id="api-key"
													type="password"
													value={apiKey}
													onChange={(event) =>
														onApiKeyChange(
															event.target.value
														)
													}
													placeholder="sk-..."
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="base-url">
													Base URL
												</Label>
												<Popover
													open={baseUrlOpen}
													onOpenChange={(open) => {
														setBaseUrlOpen(open);
														if (open) {
															setBaseUrlQuery(
																baseUrl ||
																	BASE_URL
															);
														}
													}}
												>
													<PopoverTrigger asChild>
														<Button
															id="base-url"
															variant="outline"
															role="combobox"
															aria-expanded={
																baseUrlOpen
															}
															className="w-full justify-between"
														>
															<span className="truncate text-left">
																{baseUrl ||
																	BASE_URL}
															</span>
															<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-[360px] p-0">
														<Command>
															<CommandInput
																placeholder="Type or select a base URL..."
																value={
																	baseUrlQuery
																}
																onValueChange={
																	setBaseUrlQuery
																}
																onKeyDown={(
																	event
																) => {
																	if (
																		event.key !==
																		"Enter"
																	)
																		return;
																	const next =
																		baseUrlQuery.trim();
																	if (!next)
																		return;
																	onBaseUrlChange(
																		next
																	);
																	setBaseUrlOpen(
																		false
																	);
																}}
															/>
															<CommandList>
																<CommandEmpty>
																	No base URLs
																	found.
																</CommandEmpty>
																{availableBaseUrls.map(
																	(url) => (
																		<CommandItem
																			key={
																				url
																			}
																			value={
																				url
																			}
																			onSelect={() => {
																				onBaseUrlChange(
																					url
																				);
																				setBaseUrlQuery(
																					url
																				);
																				setBaseUrlOpen(
																					false
																				);
																			}}
																		>
																			{
																				url
																			}
																		</CommandItem>
																	)
																)}
																{baseUrlQuery.trim() &&
																!availableBaseUrls.includes(
																	baseUrlQuery.trim()
																) ? (
																	<CommandItem
																		value={baseUrlQuery.trim()}
																		onSelect={() => {
																			const next =
																				baseUrlQuery.trim();
																			onBaseUrlChange(
																				next
																			);
																			setBaseUrlOpen(
																				false
																			);
																		}}
																	>
																		Use "
																		{baseUrlQuery.trim()}
																		"
																	</CommandItem>
																) : null}
															</CommandList>
														</Command>
													</PopoverContent>
												</Popover>
											</div>

										</div>
									)}
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
														personalization.accentColor
													}
													onValueChange={(value) =>
														onPersonalizationChange(
															{
																...personalization,
																accentColor:
																	value,
															}
														)
													}
												>
													<SelectTrigger id="accent-color">
														<SelectValue placeholder="Select a color" />
													</SelectTrigger>
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
																		<span
																			className="h-3 w-3 rounded-full border border-border"
																			style={{
																				backgroundColor:
																					color.value,
																			}}
																		/>
																		{
																			color.label
																		}
																	</span>
																</SelectItem>
															)
														)}
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
