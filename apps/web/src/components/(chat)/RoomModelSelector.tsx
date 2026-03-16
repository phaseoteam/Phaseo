"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

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

type RoomModelSelectorProps = {
	models: GatewaySupportedModel[];
	selectedModelIds: string[];
	onSelectModel: (modelId: string) => void;
	onRemoveModel?: (modelId: string) => void;
	onRemoveAllModels?: () => void;
	modelDisplayNameById?: Record<string, string>;
	modelEnabledById?: Record<string, boolean>;
	onOpenModelSettingsForModel?: (modelId: string) => void;
};

const MAX_PROVIDER_LOGOS = 8;
const NEW_MODEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

const isNewModel = (
	releaseDate: string | null,
	nowMs: number | null
): boolean => {
	if (!releaseDate || nowMs === null) return false;
	const releaseMs = Date.parse(releaseDate);
	if (!Number.isFinite(releaseMs)) return false;
	return releaseMs >= nowMs - NEW_MODEL_WINDOW_MS;
};

function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

function buildModelOptions(models: GatewaySupportedModel[]) {
	const map = new Map<string, ModelOption>();

	for (const model of models) {
		const existing = map.get(model.modelId);
		const orgId = getOrgId(model.modelId);
		const orgName =
			model.organisationName ?? model.providerName ?? formatOrgLabel(orgId);
		const label = model.modelName ?? formatModelLabel(model.modelId);
		const releaseDate = model.releaseDate ?? model.announcementDate ?? null;

		if (!existing) {
			map.set(model.modelId, {
				modelId: model.modelId,
				orgId,
				orgName,
				label,
				providerIds: [model.providerId],
				providerNames: [model.providerName ?? formatOrgLabel(model.providerId)],
				providerAvailability: { [model.providerId]: model.isAvailable },
				releaseDate,
				gatewayStatus: model.isAvailable ? "active" : "inactive",
			});
		} else {
			if (!existing.providerIds.includes(model.providerId)) {
				existing.providerIds.push(model.providerId);
			}
			const providerLabel = model.providerName ?? formatOrgLabel(model.providerId);
			if (!existing.providerNames.includes(providerLabel)) {
				existing.providerNames.push(providerLabel);
			}
			existing.providerAvailability[model.providerId] =
				existing.providerAvailability[model.providerId] || model.isAvailable;
			if (!existing.releaseDate && releaseDate) {
				existing.releaseDate = releaseDate;
			}
			if (existing.label === formatModelLabel(existing.modelId) && model.modelName) {
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
		gatewayStatus: Object.values(option.providerAvailability).some(Boolean)
			? ("active" as const)
			: ("inactive" as const),
	}));

	const featured: ModelOption[] = [];
	const grouped = new Map<string, ModelOption[]>();
	const comingSoon = new Map<string, ModelOption[]>();
	for (const option of options) {
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

	const sortGroupsByOrgName = (groups: Map<string, ModelOption[]>) =>
		new Map(
			Array.from(groups.entries()).sort(([, aList], [, bList]) => {
				const aName = aList[0]?.orgName ?? "";
				const bName = bList[0]?.orgName ?? "";
				return aName.localeCompare(bName);
			}),
		);

	return {
		featured,
		grouped: sortGroupsByOrgName(grouped),
		comingSoon: sortGroupsByOrgName(comingSoon),
	};
}

function buildSearchKeywords(option: ModelOption) {
	const joined = [
		option.modelId,
		option.label,
		option.orgName,
		option.orgId,
		...option.providerNames,
		...option.providerIds,
	]
		.join(" ")
		.toLowerCase();
	return joined.split(/\s+/).filter(Boolean);
}

export function RoomModelSelector({
	models,
	selectedModelIds,
	onSelectModel,
	onRemoveModel,
	onRemoveAllModels,
	modelDisplayNameById,
	modelEnabledById,
	onOpenModelSettingsForModel,
}: RoomModelSelectorProps) {
	const modelOptions = useMemo(() => buildModelOptions(models), [models]);
	const [open, setOpen] = useState(false);
	const [nowMs, setNowMs] = useState<number | null>(null);

	useEffect(() => {
		setNowMs(Date.now());
	}, []);

	const selectedModelPreview = selectedModelIds.slice(0, 5);
	const hiddenSelectedCount = Math.max(
		0,
		selectedModelIds.length - selectedModelPreview.length,
	);
	const hiddenSelectedModelIds = useMemo(
		() => selectedModelIds.slice(selectedModelPreview.length),
		[selectedModelIds, selectedModelPreview.length],
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
	}, [modelOptions.comingSoon, modelOptions.featured, modelOptions.grouped]);
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
	}, [modelOptions.comingSoon, modelOptions.featured, modelOptions.grouped]);

	const renderProviderLogos = (option: ModelOption) => {
		const providerNameById = new Map(
			option.providerIds.map((providerId, index) => [
				providerId,
				option.providerNames[index] ?? formatOrgLabel(providerId),
			]),
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
									: "grayscale opacity-60",
							)}
						/>
					))}
				</div>
				{hiddenCount > 0 ? <span className="pl-2">+{hiddenCount}</span> : null}
			</div>
		);
	};

	const renderModelRow = (option: ModelOption, withComingSoonBadge = false) => (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate text-sm font-medium">
					{option.label.split(":")[0]}
				</span>
				{option.modelId.includes(":") ? (
					<Badge {...getModelBadgeProps(option.modelId.split(":")[1])}>
						{option.modelId.split(":")[1].replace(/^free$/, "Free")}
					</Badge>
				) : null}
				{isNewModel(option.releaseDate, nowMs) ? (
					<Badge {...getModelBadgeProps("new")}>New</Badge>
				) : null}
				{selectedModelIds.includes(option.modelId) ? (
					<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
						Selected
					</Badge>
				) : null}
				{withComingSoonBadge ? (
					<Badge
						variant="outline"
						className="h-4 rounded-full border-dashed px-1.5 text-[10px] font-medium"
					>
						Coming soon
					</Badge>
				) : null}
			</div>
			{renderProviderLogos(option)}
		</div>
	);

	const renderSelectedModelChip = (modelId: string) => {
		const orgId = selectedModelOrgIdById.get(modelId) ?? getOrgId(modelId);
		const baseLabel = (selectedModelLabelById.get(modelId) ?? modelId).split(":")[0];
		const label = modelDisplayNameById?.[modelId]?.trim() || baseLabel;
		const modelEnabled = modelEnabledById?.[modelId] !== false;
		const canRemoveModel = Boolean(onRemoveModel);
		return (
			<div key={modelId} className="relative shrink-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onOpenModelSettingsForModel?.(modelId)}
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
					<button
						type="button"
						className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							onRemoveModel?.(modelId);
						}}
						aria-label={`Remove ${label}`}
					>
						<X className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
		);
	};

	const groupedEntries = useMemo(
		() => Array.from(modelOptions.grouped.entries()),
		[modelOptions.grouped],
	);
	const comingSoonEntries = useMemo(
		() => Array.from(modelOptions.comingSoon.entries()),
		[modelOptions.comingSoon],
	);
	const comingSoonCount = useMemo(
		() =>
			comingSoonEntries.reduce((total, [, list]) => total + list.length, 0),
		[comingSoonEntries],
	);

	return (
		<div className="flex items-center gap-1">
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
							<HoverCardContent className="w-[min(86vw,540px)] p-2">
								<div className="flex max-h-[280px] flex-wrap items-center gap-1 overflow-auto pr-1">
									{hiddenSelectedModelIds.map(renderSelectedModelChip)}
								</div>
							</HoverCardContent>
						</HoverCard>
					) : null}
				</div>
			) : null}

			<ModelSelector open={open} onOpenChange={setOpen}>
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
						<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
						{modelOptions.featured.length > 0 ? (
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
												onSelectModel(option.modelId);
												setOpen(false);
											}}
											keywords={buildSearchKeywords(option)}
											className={cn(
												"flex items-center gap-3",
												selectedModelIds.includes(option.modelId) &&
													"bg-foreground/5",
											)}
										>
											<Logo
												id={option.orgId}
												alt={option.orgName}
												width={18}
												height={18}
												className="shrink-0"
											/>
											{renderModelRow(option)}
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
								<ModelSelectorSeparator />
							</>
						) : null}

						{groupedEntries.map(([orgId, options]) => {
							const orgLabel = options[0]?.orgName ?? formatOrgLabel(orgId);
							return (
								<ModelSelectorGroup key={orgId} heading={orgLabel} className="pb-2">
									{options.map((option) => (
										<ModelSelectorItem
											key={option.modelId}
											value={option.modelId}
											onSelect={() => {
												onSelectModel(option.modelId);
												setOpen(false);
											}}
											keywords={buildSearchKeywords(option)}
											className={cn(
												"flex items-center gap-3",
												selectedModelIds.includes(option.modelId) &&
													"bg-foreground/5",
											)}
										>
											<Logo
												id={option.orgId}
												alt={option.orgName}
												width={18}
												height={18}
												className="shrink-0"
											/>
											{renderModelRow(option)}
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							);
						})}

						{comingSoonCount > 0 ? (
							<>
								<ModelSelectorSeparator />
								{comingSoonEntries.map(([orgId, options]) => {
									const orgLabel = options[0]?.orgName ?? formatOrgLabel(orgId);
									return (
										<ModelSelectorGroup
											key={`coming-soon-${orgId}`}
											heading={`${orgLabel} - Coming Soon`}
											className="pb-2"
										>
											{options.map((option) => (
												<ModelSelectorItem
													key={option.modelId}
													value={option.modelId}
													onSelect={() => {
														onSelectModel(option.modelId);
														setOpen(false);
													}}
													keywords={buildSearchKeywords(option)}
													className={cn(
														"flex items-center gap-3 opacity-60",
														selectedModelIds.includes(option.modelId) &&
															"bg-foreground/5",
													)}
												>
													<Logo
														id={option.orgId}
														alt={option.orgName}
														width={18}
														height={18}
														className="shrink-0"
													/>
													{renderModelRow(option, true)}
												</ModelSelectorItem>
											))}
										</ModelSelectorGroup>
									);
								})}
							</>
						) : null}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>
		</div>
	);
}
