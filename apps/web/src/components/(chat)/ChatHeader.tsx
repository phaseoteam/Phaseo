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
import type { ChatThread } from "@/lib/indexeddb/chats";
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Cpu,
	MessageCircleDashed,
	Paintbrush,
	Settings,
	Shield,
	SlidersHorizontal,
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
	providerIds: string[];
	providerNames: string[];
	providerAvailability: Record<string, boolean>;
	releaseDate: string | null;
	gatewayStatus: "active" | "inactive";
};

type ModelOptions = {
	featured: ModelOption[];
	grouped: Map<string, ModelOption[]>;
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

const MAX_PROVIDER_LOGOS = 8;
const BASE_URL_OPTIONS = [BASE_URL];

type ChatHeaderProps = {
	activeThread: ChatThread | null;
	modelOptions: ModelOptions;
	selectedOrgId: string;
	selectedModelLabel: string;
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
};

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

export function ChatHeader({
	activeThread,
	modelOptions,
	selectedOrgId,
	selectedModelLabel,
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
}: ChatHeaderProps) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const [settingsTab, setSettingsTab] = useState<
		"general" | "personalization" | "admin"
	>("general");
	const [baseUrlOpen, setBaseUrlOpen] = useState(false);
	const [baseUrlQuery, setBaseUrlQuery] = useState(baseUrl);
	const groupedEntries = useMemo(
		() => Array.from(modelOptions.grouped.entries()),
		[modelOptions.grouped]
	);
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
								"rounded-full border border-background bg-background shrink-0",
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
				<ModelSelector
					open={modelPickerOpen}
					onOpenChange={onModelPickerOpenChange}
				>
					<ModelSelectorTrigger asChild>
						<Button variant="ghost" className="gap-2">
							{activeThread?.modelId ? (
								<Logo
									id={selectedOrgId}
									alt={selectedOrgId}
									width={18}
									height={18}
									className="rounded-full shrink-0"
								/>
							) : (
								<Cpu className="h-4 w-4 text-muted-foreground" />
							)}
							<span className="max-w-[180px] truncate text-left text-sm">
								{selectedModelLabel}
							</span>
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
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
							{modelOptions.featured.length > 0 && (
								<ModelSelectorGroup
									heading="Featured"
									className="pb-2"
								>
									{modelOptions.featured.map((option) => (
										<ModelSelectorItem
											key={option.modelId}
											value={option.modelId}
											onSelect={() => {
												onUpdateModel(option.modelId);
												onModelPickerOpenChange(false);
											}}
											keywords={buildSearchKeywords(
												option
											)}
											className={cn(
												"flex items-center gap-3",
												activeThread?.modelId ===
													option.modelId &&
													"bg-foreground/5"
											)}
										>
											<Logo
												id={option.orgId}
												alt={option.orgId}
												width={18}
												height={18}
												className="rounded-full shrink-0"
											/>
											<div className="flex min-w-0 flex-1 items-center gap-2">
												<span className="truncate text-sm font-medium">
													{option.label}
												</span>
												{activeThread?.modelId ===
													option.modelId && (
													<Check className="h-4 w-4 text-foreground" />
												)}
											</div>
											{renderProviderLogos(option)}
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
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
													"flex items-center gap-3",
													activeThread?.modelId ===
														option.modelId &&
														"bg-foreground/5"
												)}
											>
												<Logo
													id={option.orgId}
													alt={option.orgId}
													width={18}
													height={18}
													className="rounded-full shrink-0"
												/>
												<div className="flex min-w-0 flex-1 items-center gap-2">
													<span className="truncate text-sm font-medium">
														{option.label}
													</span>
													{activeThread?.modelId ===
														option.modelId && (
														<Check className="h-4 w-4 text-foreground" />
													)}
												</div>
												{renderProviderLogos(option)}
											</ModelSelectorItem>
										))}
									</ModelSelectorGroup>
								);
							})}
							{modelOptions.comingSoon.length > 0 && (
								<>
									<ModelSelectorSeparator />
									<ModelSelectorGroup
										heading="Coming Soon"
										className="pb-2"
									>
										{modelOptions.comingSoon.map(
											(option) => (
												<ModelSelectorItem
													key={option.modelId}
													value={option.modelId}
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
														id={option.orgId}
														alt={option.orgId}
														width={18}
														height={18}
														className="rounded-full shrink-0 grayscale"
													/>
													<div className="flex min-w-0 flex-1 items-center gap-2">
														<span className="truncate text-sm font-medium">
															{option.label}
														</span>
													</div>
													{renderProviderLogos(
														option
													)}
												</ModelSelectorItem>
											)
										)}
									</ModelSelectorGroup>
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
							onClick={onOpenModelSettings}
						>
							<SlidersHorizontal className="h-5 w-5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Model parameters</TooltipContent>
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
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														Export chats
													</p>
													<p className="text-xs text-muted-foreground">
														Download all chats
														stored in this browser.
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
