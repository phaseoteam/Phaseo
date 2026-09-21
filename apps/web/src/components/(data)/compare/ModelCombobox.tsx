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
import type { ExtendedModel } from "@/data/types";
import { ProviderLogo } from "./ProviderLogo";

interface ModelComboboxProps {
	models: ExtendedModel[];
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
	models: ExtendedModel[];
};

const MAX_SELECTION = 4;

function parseTypeSet(value: ExtendedModel["input_types"]): Set<string> {
	if (!value) return new Set();
	const parts = Array.isArray(value)
		? value
		: String(value)
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean);
	return new Set(parts.map((v) => v.toLowerCase()));
}

function getEndpointSignature(model: ExtendedModel): Set<string> {
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

function buildRequiredSignature(selectedModels: ExtendedModel[]): Set<string> | null {
	let required: Set<string> | null = null;
	for (const m of selectedModels) {
		const sig = getEndpointSignature(m);
		if (!sig.size) continue;
		required = required ? intersect(required, sig) : new Set(sig);
		if (required.size === 0) return required;
	}
	return required;
}

function getReleaseDate(model: ExtendedModel): Date | null {
	if (!model.release_date) return null;
	const parsed = new Date(model.release_date);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
}

export default function ModelCombobox({
	models,
	selected,
	setSelected,
	open,
	onOpenChange,
	replaceTargetId,
	labelWhenEmpty = "Select models",
	labelWhenSelected = "Edit selected models",
	showSelectionCount = true,
	className,
}: ModelComboboxProps) {
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

	const groupedModels = React.useMemo<GroupedModels[]>(() => {
		const map = new Map<string, GroupedModels>();
		models.forEach((model) => {
			const releaseDate = getReleaseDate(model);
			const monthKey = releaseDate
				? `${releaseDate.getUTCFullYear()}-${String(releaseDate.getUTCMonth() + 1).padStart(2, "0")}`
				: "unknown";
			const monthLabel = releaseDate
				? getReleaseMonthLabel(releaseDate)
				: "Unknown release date";
			const monthTimestamp = releaseDate
				? Date.UTC(releaseDate.getUTCFullYear(), releaseDate.getUTCMonth(), 1)
				: Number.NEGATIVE_INFINITY;
			if (!map.has(monthKey)) {
				map.set(monthKey, {
					monthKey,
					monthLabel,
					monthTimestamp,
					models: [],
				});
			}
			map.get(monthKey)!.models.push(model);
		});

		return Array.from(map.values())
			.map((group) => ({
				...group,
				models: group.models
					.slice()
					.sort((a, b) => {
						const aDate = getReleaseDate(a);
						const bDate = getReleaseDate(b);
						const aTime = aDate ? aDate.getTime() : Number.NEGATIVE_INFINITY;
						const bTime = bDate ? bDate.getTime() : Number.NEGATIVE_INFINITY;
						if (aTime !== bTime) return bTime - aTime;
						return a.name.localeCompare(b.name, undefined, {
							sensitivity: "base",
						});
					}),
			}))
			.sort((a, b) => b.monthTimestamp - a.monthTimestamp);
	}, [getReleaseMonthLabel, models]);

	const filteredGroups = React.useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) return groupedModels;

		return groupedModels
			.map((group) => {
				const matchesMonth = group.monthLabel.toLowerCase().includes(term);
				if (matchesMonth) {
					return group;
				}
				const matchingModels = group.models.filter((model) => {
					const providerName = model.provider?.name ?? "";
					return (
						model.name.toLowerCase().includes(term) ||
						model.id.toLowerCase().includes(term) ||
						providerName.toLowerCase().includes(term)
					);
				});
				if (matchingModels.length === 0) return null;
				return { ...group, models: matchingModels };
			})
			.filter(Boolean) as GroupedModels[];
	}, [groupedModels, searchTerm]);

	const modelsById = React.useMemo(() => {
		const lookup = new Map<string, ExtendedModel>();
		models.forEach((model) => lookup.set(model.id, model));
		return lookup;
	}, [models]);

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
			.filter(Boolean) as ExtendedModel[];
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
				setSelectionNotice(
					"That model is already selected. Choose another model to replace this slot."
				);
				return;
			}
			if (!available) {
				setSelectionNotice(
					selectionIncompatible
						? "Your current selection mixes incompatible model types. Remove a model to continue."
						: "This model doesn't share a compatible endpoint with the current selection."
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
					? "Your current selection mixes incompatible model types. Remove a model to continue."
					: "This model doesn't share a compatible endpoint with the current selection."
			);
			return;
		}
		if (current.length >= MAX_SELECTION) {
			setSelectionNotice("You can compare up to four models at a time.");
			return;
		}
		setPendingSelection(Array.from(new Set([...current, modelId])).slice(0, MAX_SELECTION));
	};

	const buttonLabel =
		selected.length > 0 ? labelWhenSelected : labelWhenEmpty;

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
				title="Select models to compare"
				className="w-[min(92vw,560px)] max-w-none sm:max-w-none"
				commandProps={{ shouldFilter: false }}
			>
				<ModelSelectorInput
					autoFocus
					placeholder="Search models..."
					value={searchTerm}
					onValueChange={setSearchTerm}
				/>
				<div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
					<span className="truncate">
						{replaceTargetModel
							? `Replace ${replaceTargetModel.name}`
							: "Choose up to four compatible models"}
					</span>
					<span className="shrink-0 tabular-nums">
						{pendingSelection.length}/{MAX_SELECTION} selected
					</span>
				</div>
				{selectionNotice ? (
					<p className="border-b border-border px-3 py-2 text-xs text-destructive">
						{selectionNotice}
					</p>
				) : null}
				<ModelSelectorList className="max-h-[70vh]" viewportClassName="p-2">
					<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
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
															alt={model.provider?.name ?? "Unknown"}
															size="xxs"
															className="shrink-0"
														/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{model.name}</p>
								</div>
								{!modelAvailable && !isSelected ? (
									<span className="shrink-0 text-[10px] text-muted-foreground">
										Incompatible
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
