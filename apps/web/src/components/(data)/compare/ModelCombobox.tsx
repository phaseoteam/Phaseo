// ModelCombobox.tsx
"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

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
}

type GroupedModels = {
	providerId: string;
	providerName: string;
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

export default function ModelCombobox({
	models,
	selected,
	setSelected,
}: ModelComboboxProps) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
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
			const providerId = model.provider?.provider_id ?? "unknown";
			const providerName = model.provider?.name ?? providerId;
			if (!map.has(providerId)) {
				map.set(providerId, {
					providerId,
					providerName,
					models: [],
				});
			}
			map.get(providerId)!.models.push(model);
		});

		return Array.from(map.values())
			.map((group) => ({
				...group,
				models: group.models.sort((a, b) =>
					a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
				),
			}))
			.sort((a, b) =>
				a.providerName.localeCompare(b.providerName, undefined, {
					sensitivity: "base",
				})
			);
	}, [models]);

	const filteredGroups = React.useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) return groupedModels;

		return groupedModels
			.map((group) => {
				const matchesProvider = group.providerName
					.toLowerCase()
					.includes(term);
				if (matchesProvider) {
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

	const pendingSelectedModels = React.useMemo(() => {
		return pendingSelection
			.map((id) => modelsById.get(id))
			.filter(Boolean) as ExtendedModel[];
	}, [pendingSelection, modelsById]);

	const requiredSignature = React.useMemo(() => {
		return buildRequiredSignature(pendingSelectedModels);
	}, [pendingSelectedModels]);

	const compatibilityActive = requiredSignature !== null;
	const selectionIncompatible =
		compatibilityActive && requiredSignature.size === 0;

	const handleOpenChange = (open: boolean) => {
		setDialogOpen(open);
		if (open) {
			setSelectionNotice(null);
		}
	};

	const toggleSelection = (modelId: string, available: boolean) => {
		setSelectionNotice(null);
		setPendingSelection((current) => {
			if (current.includes(modelId)) {
				return current.filter((id) => id !== modelId);
			}
			if (!available) {
				setSelectionNotice(
					selectionIncompatible
						? "Your current selection mixes incompatible model types. Remove a model to continue."
						: "This model doesn't share a compatible endpoint with the current selection."
				);
				return current;
			}
			if (current.length >= MAX_SELECTION) {
				setSelectionNotice("You can compare up to four models at a time.");
				return current;
			}
			return [...current, modelId];
		});
	};

	const removeSelection = (modelId: string) => {
		setPendingSelection((current) =>
			current.filter((existing) => existing !== modelId)
		);
	};

	const handleApply = () => {
		const nextSelection = Array.from(new Set(pendingSelection)).slice(
			0,
			MAX_SELECTION
		);
		setSelected(nextSelection);
		setDialogOpen(false);
	};

	const buttonLabel =
		selected.length > 0 ? "Edit selected models" : "Select models";

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
						selected.length === 0 && "text-muted-foreground"
					)}
				>
					<Plus className="h-4 w-4" />
					{buttonLabel}
					{selected.length > 0 && (
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
						Pick up to four models. We group everything by organisation to
						make browsing easier. Use search to jump straight to a specific
						model or provider.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Input
						autoFocus
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search by model name, identifier, or organisation"
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

					<div className="max-h-[420px] space-y-4 overflow-y-auto pr-2">
						{filteredGroups.length === 0 ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								No models match your search yet.
							</p>
						) : (
							filteredGroups.map((group) => (
								<div
									key={group.providerId}
									className="rounded-lg border border-border/60 p-4"
								>
									<div className="mb-3 flex items-center justify-between gap-4">
										<div className="flex items-center gap-2">
											<ProviderLogo
												id={group.providerId}
												alt={group.providerName}
												size="xs"
											/>
											<span className="font-semibold">
												{group.providerName}
											</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{group.models.length} model
											{group.models.length === 1 ? "" : "s"}
										</span>
									</div>
									<div className="grid gap-2 sm:grid-cols-2">
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
											const isSelected =
												pendingSelection.includes(
													model.id
												);
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
														"flex w-full items-center justify-between rounded-lg border p-3 text-left transition",
														isSelected
															? "border-primary bg-primary/5 shadow-sm"
															: "hover:border-primary",
														!modelAvailable &&
															!isSelected &&
															"opacity-60"
													)}
													disabled={
														!modelAvailable &&
														!isSelected
													}
												>
													<div className="space-y-1">
														<p className="text-sm font-medium leading-tight">
															{model.name}
														</p>
														<p className="text-xs text-muted-foreground font-mono">
															{model.id}
														</p>
													</div>
													<div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
														<span>
															{model.provider?.name ??
																group.providerName}
														</span>
														{!modelAvailable && (
															<Badge
																variant="outline"
																className="text-[10px] px-2 py-0.5"
															>
																Incompatible
															</Badge>
														)}
														{isSelected && (
															<Badge
																variant="secondary"
																className="text-[10px] bg-primary/10 text-primary px-2 py-0.5"
															>
																Selected
															</Badge>
														)}
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
						onClick={() => {
							setPendingSelection(selected.slice(0, MAX_SELECTION));
							setSelectionNotice(null);
						}}
					>
						Reset to current selection
					</Button>
					<Button
						type="button"
						onClick={handleApply}
						disabled={pendingSelection.length === 0}
					>
						Apply selection
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
