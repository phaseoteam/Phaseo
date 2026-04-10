// ModelCombobox.tsx
"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

function getReleaseMonthLabel(date: Date): string {
	return date.toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
	});
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
	}, [models]);

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

	const removeSelection = (modelId: string) => {
		const current = pendingSelection.slice(0, MAX_SELECTION);
		setPendingSelection(current.filter((existing) => existing !== modelId));
	};

	const buttonLabel =
		selected.length > 0 ? labelWhenSelected : labelWhenEmpty;

	const selectedDetails = pendingSelection.map((id) => {
		const model = modelsById.get(id);
		return {
			id,
			label: model?.name ?? id,
		};
	});

	return (
		<Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-fit justify-start gap-2",
						selected.length === 0 && "text-muted-foreground",
						className
					)}
				>
					<Plus className="h-4 w-4" />
					{buttonLabel}
					{showSelectionCount && selected.length > 0 && (
						<Badge
							variant="secondary"
							className="ml-1 bg-primary/10 text-primary"
						>
							{selected.length}/{MAX_SELECTION}
						</Badge>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-4xl space-y-4">
				<DialogHeader>
					<DialogTitle>Choose models to compare</DialogTitle>
					<DialogDescription>
						{replaceTargetModel
							? `Replacing ${replaceTargetModel.name}. Select another compatible model to swap into this slot.`
							: "Pick up to four models. Results are grouped by release month (newest first). Use search to jump to a model, provider, or month."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Input
						autoFocus
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search by model name, identifier, provider, or month"
					/>

					<div className="rounded-md border border-dashed border-border/60 p-3">
						<div className="flex items-center justify-between">
							<p className="text-xs font-medium text-muted-foreground">
								Selected
							</p>
							<span className="text-xs text-muted-foreground">
								{pendingSelection.length}/{MAX_SELECTION} chosen
							</span>
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							{selectedDetails.length > 0 ? (
								selectedDetails.map((entry) => (
									<Badge
										key={entry.id}
										variant="secondary"
										className="flex items-center gap-2 rounded-full px-3 py-1"
									>
										<span className="text-xs font-medium">
											{entry.label}
										</span>
										<button
											type="button"
											className="rounded-full p-0.5 transition hover:bg-muted"
											onClick={() => removeSelection(entry.id)}
											aria-label={`Remove ${entry.label}`}
										>
											<X className="h-3 w-3" />
										</button>
									</Badge>
								))
							) : (
								<p className="text-xs text-muted-foreground">
									No models selected yet.
								</p>
							)}
						</div>
					</div>

					{compatibilityActive ? (
						<div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
							We only allow comparisons across models that share compatible
							endpoints (based on input/output modalities).
						</div>
					) : null}

					<div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
						{filteredGroups.length === 0 ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								No models match your search yet.
							</p>
						) : (
							filteredGroups.map((group) => (
								<div key={group.monthKey} className="space-y-2">
									<div className="sticky top-0 z-10 -mx-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
										<div className="flex items-center justify-between gap-4">
											<span className="text-sm font-semibold">
												{group.monthLabel}
											</span>
											<span className="text-[11px] text-muted-foreground">
												{group.models.length} model
												{group.models.length === 1 ? "" : "s"}
											</span>
										</div>
									</div>
									<div className="space-y-2">
										{group.models.map((model) => {
											const sig = getEndpointSignature(model);
											const hasSignature = sig.size > 0;
											const modalities = Array.from(sig).slice(0, 3);
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
												<button
													type="button"
													key={model.id}
													onClick={() =>
														toggleSelection(
															model.id,
															modelAvailable
														)
													}
													className={cn(
														"group flex w-full items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2 text-left transition",
														isSelected
															? "border-primary/60 bg-primary/5 shadow-sm"
															: "hover:border-primary/40 hover:bg-muted/30",
														!modelAvailable &&
															!isSelected &&
															"opacity-60 cursor-not-allowed"
													)}
													disabled={!modelAvailable && !isSelected}
												>
													<div className="flex min-w-0 items-center gap-3">
														<ProviderLogo
															id={model.provider?.provider_id ?? "unknown"}
															alt={model.provider?.name ?? "Unknown"}
															size="xs"
															className="shrink-0"
														/>
														<div className="min-w-0 space-y-1">
															<div className="flex items-center gap-2">
																<p className="truncate text-sm font-medium leading-tight">
																	{model.name}
																</p>
																{isSelected ? (
																	<Badge
																		variant="secondary"
																		className="text-[10px] bg-primary/10 text-primary px-1.5 py-0"
																	>
																		Selected
																	</Badge>
																) : null}
															</div>
															<p className="truncate text-[11px] text-muted-foreground font-mono">
																{model.id}
															</p>
														</div>
													</div>
													<div className="ml-2 flex flex-col items-end gap-1.5 text-xs text-muted-foreground">
														<div className="flex flex-wrap justify-end gap-1">
															{modalities.map((modality) => (
																<Badge
																	key={`${model.id}-${modality}`}
																	variant="outline"
																	className="px-1.5 py-0 text-[10px] font-normal uppercase"
																>
																	{modality}
																</Badge>
															))}
														</div>
														{!modelAvailable && (
															<Badge
																variant="outline"
																className="text-[10px] px-2 py-0.5"
															>
																Incompatible
															</Badge>
														)}
														{isSelected ? (
															<span className="inline-flex items-center gap-1 text-[10px] text-primary">
																<Check className="h-3 w-3" />
																Included
															</span>
														) : null}
													</div>
												</button>
											);
										})}
									</div>
								</div>
							))
						)}
					</div>
				</div>

				{selectionNotice && (
					<p className="text-sm text-destructive">{selectionNotice}</p>
				)}

				<DialogFooter className="gap-3 sm:gap-2">
					<Button
						variant="outline"
						type="button"
						onClick={() => handleOpenChange(false)}
					>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
