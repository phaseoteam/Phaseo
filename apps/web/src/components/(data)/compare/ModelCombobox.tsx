// ModelCombobox.tsx
"use client";

import * as React from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import type { CompareModelOption } from "./types";
import { ProviderLogo } from "./ProviderLogo";
import { useCompareModelOptions, usePrefetchCompareModelOptions } from "./useCompareModelOptions";
import { useTranslations } from "@/i18n/react";

interface ModelComboboxProps {
	/** Options the page already has: the selected models. The full list loads when the picker opens. */
	selectedOptions: CompareModelOption[];
	selected: string[];
	setSelected: (ids: string[]) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	replaceTargetId?: string | null;
	labelWhenEmpty?: string;
	labelWhenSelected?: string;
	showSelectionCount?: boolean;
	className?: string;
}

type GroupedModels = {
	monthKey: string;
	monthLabel: string;
	monthTimestamp: number;
	models: CompareModelOption[];
};

const MAX_SELECTION = 4;

function parseTypeSet(value: CompareModelOption["input_types"]): Set<string> {
	if (!value) return new Set();
	const parts = Array.isArray(value)
		? value
		: String(value)
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean);
	return new Set(parts.map((v) => v.toLowerCase()));
}

function getEndpointSignature(model: CompareModelOption): Set<string> {
	// Proxy for "endpoints": treat output types as the primary signal,
	// falling back to input types if output is missing.
	const out = parseTypeSet(model.output_types);
	if (out.size) return out;
	return parseTypeSet(model.input_types);
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
	if (a.size === 0 || b.size === 0) return new Set();
	const out = new Set<string>();
	for (const v of a) {
		if (b.has(v)) out.add(v);
	}
	return out;
}

function buildRequiredSignature(selectedModels: CompareModelOption[]): Set<string> | null {
	let required: Set<string> | null = null;
	for (const m of selectedModels) {
		const sig = getEndpointSignature(m);
		if (!sig.size) continue;
		required = required ? intersect(required, sig) : new Set(sig);
		if (required.size === 0) return required;
	}
	return required;
}

function getReleaseDate(model: CompareModelOption): Date | null {
	if (!model.release_date) return null;
	const parsed = new Date(model.release_date);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
}

const NO_GROUPS: GroupedModels[] = [];

function searchText(model: CompareModelOption): string {
	return `${model.name} ${model.id} ${model.provider?.name ?? ""}`.toLowerCase();
}

/**
 * Every word must appear somewhere in the name, id or lab, in any order, so
 * "qwen max" finds "Qwen 3.8 Max" and "Qwen3 Max". Models Phaseo serves come
 * first, then names that start with the query, then the newest.
 */
export function searchModels(models: CompareModelOption[], query: string): CompareModelOption[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return models;
	const first = words[0]!;
	return models
		.flatMap((model) => {
			const haystack = searchText(model);
			if (!words.every((word) => haystack.includes(word))) return [];
			const time = getReleaseDate(model)?.getTime() ?? Number.NEGATIVE_INFINITY;
			return [{ model, routed: model.routed ? 0 : 1, prefix: model.name.toLowerCase().startsWith(first) ? 0 : 1, time }];
		})
		.sort((a, b) => a.routed - b.routed || a.prefix - b.prefix || b.time - a.time || a.model.name.localeCompare(b.model.name))
		.map((entry) => entry.model);
}

/**
 * Groups models by release month, newest first, and sorts each month newest first
 * then by name. Each date is parsed once and each month labelled once: the list
 * holds every catalogue model, so per-model formatting is the expensive part.
 */
export function groupModelsByReleaseMonth(
	models: CompareModelOption[],
	monthLabel: (date: Date) => string,
	unknownLabel: string,
): GroupedModels[] {
	const collator = new Intl.Collator(undefined, { sensitivity: "base" });
	const groups = new Map<string, GroupedModels & { entries: Array<{ model: CompareModelOption; time: number }> }>();
	for (const model of models) {
		const releaseDate = getReleaseDate(model);
		const monthKey = releaseDate
			? `${releaseDate.getUTCFullYear()}-${String(releaseDate.getUTCMonth() + 1).padStart(2, "0")}`
			: "unknown";
		let group = groups.get(monthKey);
		if (!group) {
			group = {
				monthKey,
				monthLabel: releaseDate ? monthLabel(releaseDate) : unknownLabel,
				monthTimestamp: releaseDate
					? Date.UTC(releaseDate.getUTCFullYear(), releaseDate.getUTCMonth(), 1)
					: Number.NEGATIVE_INFINITY,
				models: [],
				entries: [],
			};
			groups.set(monthKey, group);
		}
		group.entries.push({ model, time: releaseDate ? releaseDate.getTime() : Number.NEGATIVE_INFINITY });
	}

	return Array.from(groups.values())
		.map(({ entries, ...group }) => ({
			...group,
			models: entries
				.sort((a, b) => (a.time !== b.time ? b.time - a.time : collator.compare(a.model.name, b.model.name)))
				.map((entry) => entry.model),
		}))
		.sort((a, b) => b.monthTimestamp - a.monthTimestamp);
}

export default function ModelCombobox({
	selectedOptions,
	selected,
	setSelected,
	open,
	onOpenChange,
	replaceTargetId,
	labelWhenEmpty,
	labelWhenSelected,
	showSelectionCount = true,
	className,
}: ModelComboboxProps) {
	const t = useTranslations("Catalogue.compare");
	const format = useDisplayFormatters();
	const getReleaseMonthLabel = React.useCallback(
		(date: Date) => format.dateParts(date, {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}),
		[format],
	);
	const [internalDialogOpen, setInternalDialogOpen] = React.useState(false);
	const openPropIsControlled = open !== undefined;
	const dialogOpen = open ?? internalDialogOpen;
	const [searchTerm, setSearchTerm] = React.useState("");
	const [pendingSelection, setPendingSelection] = React.useState<string[]>(
		selected.slice(0, MAX_SELECTION)
	);
	const [selectionNotice, setSelectionNotice] =
		React.useState<string | null>(null);

	React.useEffect(() => {
		if (dialogOpen) return;
		setPendingSelection((current) => {
			const next = selected.slice(0, MAX_SELECTION);
			if (
				current.length === next.length &&
				current.every((value, index) => value === next[index])
			) {
				return current;
			}
			return next;
		});
	}, [selected, dialogOpen]);

	// The list only shows in the open dialog, so it loads when a picker first
	// opens: pages, server renders and closed pickers carry no catalogue.
	const optionsQuery = useCompareModelOptions(dialogOpen);
	const prefetchOptions = usePrefetchCompareModelOptions();
	const catalogue = optionsQuery.data;
	const groupedModels = React.useMemo<GroupedModels[]>(
		() => (dialogOpen && catalogue ? groupModelsByReleaseMonth(catalogue, getReleaseMonthLabel, t("unknownReleaseDate")) : NO_GROUPS),
		[catalogue, dialogOpen, getReleaseMonthLabel, t],
	);

	const searching = searchTerm.trim().length > 0;
	const filteredGroups = React.useMemo<GroupedModels[]>(() => {
		if (!searching) return groupedModels;
		const results = catalogue ? searchModels(catalogue, searchTerm) : [];
		return results.length
			? [{ monthKey: "results", monthLabel: t("resultCount", { count: results.length }), monthTimestamp: 0, models: results }]
			: NO_GROUPS;
	}, [catalogue, groupedModels, searchTerm, searching, t]);

	const modelsById = React.useMemo(() => {
		const lookup = new Map<string, CompareModelOption>();
		for (const model of catalogue ?? []) lookup.set(model.id, model);
		for (const model of selectedOptions) lookup.set(model.id, model);
		return lookup;
	}, [catalogue, selectedOptions]);

	const activeReplaceTarget = React.useMemo(() => {
		if (!replaceTargetId) return null;
		return pendingSelection.includes(replaceTargetId) ? replaceTargetId : null;
	}, [replaceTargetId, pendingSelection]);

	const replaceTargetModel = React.useMemo(() => {
		if (!activeReplaceTarget) return null;
		return modelsById.get(activeReplaceTarget) ?? null;
	}, [activeReplaceTarget, modelsById]);

	const pendingSelectedModelsForCompatibility = React.useMemo(() => {
		const idsForCompatibility = activeReplaceTarget
			? pendingSelection.filter((id) => id !== activeReplaceTarget)
			: pendingSelection;
		return idsForCompatibility
			.map((id) => modelsById.get(id))
			.filter(Boolean) as CompareModelOption[];
	}, [activeReplaceTarget, pendingSelection, modelsById]);

	const requiredSignature = React.useMemo(() => {
		return buildRequiredSignature(pendingSelectedModelsForCompatibility);
	}, [pendingSelectedModelsForCompatibility]);

	const compatibilityActive = requiredSignature !== null;
	const selectionIncompatible =
		compatibilityActive && requiredSignature.size === 0;

	const handleOpenChange = (open: boolean) => {
		if (openPropIsControlled) {
			onOpenChange?.(open);
		} else {
			setInternalDialogOpen(open);
			onOpenChange?.(open);
		}
		if (open) {
			setSelectionNotice(null);
		}
	};

	React.useEffect(() => {
		if (!dialogOpen) return;
		const nextSelection = Array.from(new Set(pendingSelection)).slice(
			0,
			MAX_SELECTION
		);
		const currentSelection = selected.slice(0, MAX_SELECTION);
		if (
			nextSelection.length === currentSelection.length &&
			nextSelection.every((value, index) => value === currentSelection[index])
		) {
			return;
		}
		setSelected(nextSelection);
	}, [dialogOpen, pendingSelection, selected, setSelected]);

	const toggleSelection = (modelId: string, available: boolean) => {
		setSelectionNotice(null);
		const current = pendingSelection.slice(0, MAX_SELECTION);

		if (activeReplaceTarget) {
			if (modelId === activeReplaceTarget) return;
			if (current.includes(modelId)) {
				setSelectionNotice(t("alreadySelected"));
				return;
			}
			if (!available) {
				setSelectionNotice(
					selectionIncompatible
						? t("incompatibleSelection")
						: t("noCompatibleEndpoint")
				);
				return;
			}
			const targetIndex = current.indexOf(activeReplaceTarget);
			if (targetIndex === -1) return;
			const next = current.slice();
			next[targetIndex] = modelId;
			setPendingSelection(Array.from(new Set(next)).slice(0, MAX_SELECTION));
			handleOpenChange(false);
			return;
		}

		if (current.includes(modelId)) {
			setPendingSelection(current.filter((id) => id !== modelId));
			return;
		}
		if (!available) {
			setSelectionNotice(
				selectionIncompatible
					? t("incompatibleSelection")
					: t("noCompatibleEndpoint")
			);
			return;
		}
		if (current.length >= MAX_SELECTION) {
			setSelectionNotice(t("selectionLimit"));
			return;
		}
		setPendingSelection(Array.from(new Set([...current, modelId])).slice(0, MAX_SELECTION));
	};

	const optionMeta = (model: CompareModelOption) => {
		const inputs = [...parseTypeSet(model.input_types)];
		const outputs = [...parseTypeSet(model.output_types)];
		const releaseDate = getReleaseDate(model);
		return [
			model.provider?.name,
			inputs.length && outputs.length ? `${inputs.join(", ")} → ${outputs.join(", ")}` : null,
			releaseDate ? format.dateParts(releaseDate, { month: "short", year: "numeric", timeZone: "UTC" }) : null,
		].filter(Boolean).join(" · ");
	};

	const buttonLabel =
		selected.length > 0
			? labelWhenSelected ?? t("editModels")
			: labelWhenEmpty ?? t("selectModels");

	return (
		<ModelSelector open={dialogOpen} onOpenChange={handleOpenChange}>
			<ModelSelectorTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-8 w-fit justify-start gap-1.5 px-2 text-xs",
						selected.length === 0 && "text-muted-foreground",
						className
					)}
					onPointerEnter={prefetchOptions}
					onFocus={prefetchOptions}
				>
					<Plus className="size-4" />
					{buttonLabel}
					{showSelectionCount && selected.length > 0 && (
						<Badge
							variant="secondary"
							className="ml-0.5 h-5 rounded-md bg-primary/10 px-1.5 text-[10px] text-primary"
						>
							{selected.length}/{MAX_SELECTION}
						</Badge>
					)}
				</Button>
			</ModelSelectorTrigger>
			<ModelSelectorContent
					title={t("pickerTitle")}
				className="top-[8vh] w-[min(92vw,600px)] max-w-none translate-y-0 rounded-md sm:top-[12vh] sm:max-w-none"
				commandProps={{ shouldFilter: false }}
			>
				<ModelSelectorInput
					autoFocus
					placeholder={t("searchModels")}
					value={searchTerm}
					onValueChange={setSearchTerm}
				/>
				<div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
					<span className="truncate">
						{replaceTargetModel
							? t("replaceModel", { name: replaceTargetModel.name })
							: t("chooseCompatibleModels")}
					</span>
					<span className="shrink-0 tabular-nums">
						{t("selectedCount", { count: pendingSelection.length })}
					</span>
				</div>
				{selectionNotice ? (
					<p className="border-b border-border px-3 py-2 text-xs text-destructive">
						{selectionNotice}
					</p>
				) : null}
				<ModelSelectorList className="max-h-[70vh]" viewportClassName="p-2">
					{!catalogue && optionsQuery.isError ? (
						<div role="alert" className="flex flex-col items-center gap-3 px-3 py-6 text-center text-sm text-muted-foreground">
							<p>{t("modelsUnavailable")}</p>
							<Button type="button" variant="outline" size="sm" onClick={() => void optionsQuery.refetch()}>
								{t("tryAgain")}
							</Button>
						</div>
					) : !catalogue ? (
						<p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
							{t("loadingModels")}
						</p>
					) : (
						<ModelSelectorEmpty>{t("noModelsFound")}</ModelSelectorEmpty>
					)}
					{filteredGroups.map((group) => (
						<ModelSelectorGroup
							key={group.monthKey}
							heading={group.monthLabel}
						>
							{group.models.map((model) => {
											const sig = getEndpointSignature(model);
											const hasSignature = sig.size > 0;
											const modelAvailable = (() => {
												// Always allow removing an already-selected model.
												if (pendingSelection.includes(model.id)) return true;
												// If we have an active signature requirement, enforce it.
												if (requiredSignature && requiredSignature.size > 0) {
													if (!hasSignature) return false;
													for (const v of sig) {
														if (requiredSignature.has(v)) return true;
													}
													return false;
												}
												// If selection is incompatible, block adding more until user fixes it.
												if (selectionIncompatible) return false;
												return true;
											})();
											const isSelected = pendingSelection.includes(model.id);
											return (
								<ModelSelectorItem
													key={model.id}
									value={model.id}
									disabled={!modelAvailable && !isSelected}
									onSelect={() =>
														toggleSelection(
															model.id,
															modelAvailable
														)
													}
									className={cn(
										"min-h-9 gap-2.5 rounded-md px-2.5 py-1.5",
										isSelected
											? "bg-primary/8 aria-selected:bg-primary/12"
											: "",
										!modelAvailable &&
											!isSelected &&
											"opacity-50"
									)}
								>
														<ProviderLogo
															id={model.provider?.provider_id ?? "unknown"}
										alt={model.provider?.name ?? t("unknownProvider")}
															size="xxs"
															className="shrink-0"
														/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{model.name}</p>
									<p className="truncate text-xs text-muted-foreground">{optionMeta(model)}</p>
								</div>
								<OptionBadge model={model} />
								{!modelAvailable && !isSelected ? (
									<span className="shrink-0 text-[10px] text-muted-foreground">
										{t("incompatible")}
									</span>
								) : null}
								{isSelected ? <Check className="size-4 shrink-0" /> : null}
								</ModelSelectorItem>
											);
							})}
						</ModelSelectorGroup>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}

function OptionBadge({ model }: { model: CompareModelOption }) {
	const t = useTranslations("Catalogue.compareView");
	const status = model.status?.toLowerCase();
	if (status === "retired" || status === "deprecated") {
		return <span className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 text-[11px] text-amber-700 dark:text-amber-300">{status === "retired" ? t("badgeRetired") : t("badgeDeprecated")}</span>;
	}
	if (model.routed) {
		return <span className="shrink-0 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">{t("badgeOnPhaseo")}</span>;
	}
	if (status === "preview") return <span className="shrink-0 rounded-sm border border-border px-1.5 text-[11px] text-muted-foreground">{t("badgePreview")}</span>;
	if (model.routed === false) return <span className="shrink-0 rounded-sm border border-border px-1.5 text-[11px] text-muted-foreground">{t("badgeListedOnly")}</span>;
	return null;
}
