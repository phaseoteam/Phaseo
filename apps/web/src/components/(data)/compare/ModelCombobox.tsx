// ModelCombobox.tsx
"use client";

import * as React from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Archive, ArrowRight, Check, CircleAlert, CircleCheck, CircleDashed, FlaskConical, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
	getVirtualizedModelCatalogItemId,
	VirtualizedModelCatalog,
	type VirtualizedModelCatalogSection,
} from "@/components/(chat)/VirtualizedModelCatalog";
import { getModalityIcon } from "@/components/(data)/models/Models/modalityIcons";
import { useModalityLabel } from "@/components/(data)/models/Models/useModalityLabel";
import type { CompareModelOption } from "./types";
import { ProviderLogo } from "./ProviderLogo";
import { useCompareModelOptions, usePrefetchCompareModelOptions } from "./useCompareModelOptions";
import { useTranslations } from "next-intl";

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

export type PickerAvailability =
	| { available: true }
	/** The model returns something else, e.g. video when the selection returns text. */
	| { available: false; reason: "returns"; returns: string[] }
	/** The current selection already mixes types, so nothing more can be added. */
	| { available: false; reason: "mixed" };

/**
 * Whether a model can join the selection. Compare rows only make sense for
 * models that return the same kind of output, so the picker hides the rest
 * until they are searched for, and then says why they can't be added.
 */
export function pickerAvailability(model: CompareModelOption, required: Set<string> | null, selected: string[]): PickerAvailability {
	if (selected.includes(model.id) || required === null) return { available: true };
	if (required.size === 0) return { available: false, reason: "mixed" };
	const signature = getEndpointSignature(model);
	for (const type of signature) if (required.has(type)) return { available: true };
	return { available: false, reason: "returns", returns: [...signature] };
}

/** Lab, inputs → outputs as the models-page icons, and release month. */
function OptionMeta({ model, monthLabel }: { model: CompareModelOption; monthLabel: string | null }) {
	const modalityLabel = useModalityLabel();
	const icons = (types: Set<string>) => [...types].map((type) => {
		const Icon = getModalityIcon(type);
		return (
			<span key={type} title={modalityLabel(type)} className="inline-flex">
				<Icon aria-hidden className={cn("size-3.5", getModalityTone(type).iconClassName)} />
				<span className="sr-only">{modalityLabel(type)}</span>
			</span>
		);
	});
	const inputs = parseTypeSet(model.input_types);
	const outputs = parseTypeSet(model.output_types);
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			{model.provider?.name ? <span className="truncate">{model.provider.name}</span> : null}
			{inputs.size && outputs.size ? (
				<span className="inline-flex shrink-0 items-center gap-1">
					{icons(inputs)}
					<ArrowRight aria-hidden className="size-3 opacity-60" />
					{icons(outputs)}
				</span>
			) : null}
			{monthLabel ? <span className="shrink-0">{monthLabel}</span> : null}
		</span>
	);
}

/** Availability and lifecycle as an icon; the tooltip and screen-reader text name it. */
function OptionStatus({ model }: { model: CompareModelOption }) {
	const t = useTranslations("Catalogue.compareView");
	const status = model.status?.toLowerCase();
	const [Icon, label, tone] =
		status === "retired" ? [Archive, t("badgeRetired"), "text-amber-600 dark:text-amber-400"]
			: status === "deprecated" ? [CircleAlert, t("badgeDeprecated"), "text-amber-600 dark:text-amber-400"]
				: model.routed ? [CircleCheck, t("badgeOnPhaseo"), "text-emerald-600 dark:text-emerald-400"]
					: status === "preview" ? [FlaskConical, t("badgePreview"), "text-muted-foreground"]
						: model.routed === false ? [CircleDashed, t("badgeListedOnly"), "text-muted-foreground"]
							: [null, null, ""];
	if (!Icon) return null;
	return (
		<Tip label={label}>
			<span className="inline-flex shrink-0">
				<Icon aria-hidden className={cn("size-4", tone)} />
				<span className="sr-only">{label}</span>
			</span>
		</Tip>
	);
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
	const tView = useTranslations("Catalogue.compareView");
	const format = useDisplayFormatters();
	const modalityLabel = useModalityLabel();
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
	const [activeId, setActiveId] = React.useState<string | null>(null);
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

	const modelsById = React.useMemo(() => {
		const lookup = new Map<string, CompareModelOption>();
		for (const model of catalogue ?? []) lookup.set(model.id, model);
		for (const model of selectedOptions) lookup.set(model.id, model);
		return lookup;
	}, [catalogue, selectedOptions]);

	const activeReplaceTarget = replaceTargetId && pendingSelection.includes(replaceTargetId) ? replaceTargetId : null;
	const replaceTargetModel = activeReplaceTarget ? modelsById.get(activeReplaceTarget) ?? null : null;

	const requiredSignature = React.useMemo(() => buildRequiredSignature(
		(activeReplaceTarget ? pendingSelection.filter((id) => id !== activeReplaceTarget) : pendingSelection)
			.map((id) => modelsById.get(id))
			.filter((model): model is CompareModelOption => Boolean(model)),
	), [activeReplaceTarget, pendingSelection, modelsById]);

	const availability = React.useCallback(
		(model: CompareModelOption) => pickerAvailability(model, requiredSignature, pendingSelection),
		[pendingSelection, requiredSignature],
	);

	const searching = searchTerm.trim().length > 0;
	// Browsing lists only models that can join; a search lists every match, with the reason the rest can't.
	const { sections, hiddenCount } = React.useMemo(() => {
		if (!dialogOpen || !catalogue) return { sections: [] as VirtualizedModelCatalogSection<CompareModelOption>[], hiddenCount: 0 };
		if (searching) {
			const results = searchModels(catalogue, searchTerm);
			return { sections: [{ key: "results", heading: t("resultCount", { count: results.length }), items: results }], hiddenCount: 0 };
		}
		const compatible = catalogue.filter((model) => availability(model).available);
		return {
			sections: groupModelsByReleaseMonth(compatible, getReleaseMonthLabel, t("unknownReleaseDate"))
				.map((group) => ({ key: group.monthKey, heading: group.monthLabel, items: group.models })),
			hiddenCount: catalogue.length - compatible.length,
		};
	}, [availability, catalogue, dialogOpen, getReleaseMonthLabel, searchTerm, searching, t]);

	const selectable = React.useMemo(
		() => sections.flatMap((section) => section.items).filter((model) => availability(model).available),
		[availability, sections],
	);
	const resolvedActiveId = activeId && selectable.some((model) => model.id === activeId) ? activeId : selectable[0]?.id ?? null;

	const handleOpenChange = (open: boolean) => {
		if (openPropIsControlled) {
			onOpenChange?.(open);
		} else {
			setInternalDialogOpen(open);
			onOpenChange?.(open);
		}
		if (open) {
			setSelectionNotice(null);
		} else {
			setSearchTerm("");
			setActiveId(null);
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

	const toggleSelection = (modelId: string) => {
		setSelectionNotice(null);
		const current = pendingSelection.slice(0, MAX_SELECTION);

		if (activeReplaceTarget) {
			if (modelId === activeReplaceTarget) return;
			if (current.includes(modelId)) {
				setSelectionNotice(t("alreadySelected"));
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
		if (current.length >= MAX_SELECTION) {
			setSelectionNotice(t("selectionLimit"));
			return;
		}
		setPendingSelection(Array.from(new Set([...current, modelId])).slice(0, MAX_SELECTION));
	};

	const listboxId = React.useId();
	const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		// Enter and the arrow keys confirm and move between IME candidates (Japanese, Chinese); leave them to the IME.
		if (event.nativeEvent.isComposing || event.keyCode === 229 || !selectable.length) return;
		const index = Math.max(0, selectable.findIndex((model) => model.id === resolvedActiveId));
		const next =
			event.key === "ArrowDown" ? Math.min(index + 1, selectable.length - 1)
				: event.key === "ArrowUp" ? Math.max(index - 1, 0)
					: event.key === "PageDown" ? Math.min(index + 10, selectable.length - 1)
						: event.key === "PageUp" ? Math.max(index - 10, 0)
							: null;
		if (event.key === "Enter") {
			if (resolvedActiveId) {
				event.preventDefault();
				toggleSelection(resolvedActiveId);
			}
			return;
		}
		if (next === null) return;
		event.preventDefault();
		setActiveId(selectable[next]!.id);
	};

	const reasonText = (state: PickerAvailability) => {
		if (state.available) return null;
		if (state.reason === "mixed") return t("incompatibleSelection");
		return state.returns.length
			? tView("pickerReturnsOther", { types: state.returns.map(modalityLabel).join(", ") })
			: tView("pickerNoOutputTypes");
	};

	const renderItem = (model: CompareModelOption) => {
		const state = availability(model);
		const isSelected = pendingSelection.includes(model.id);
		const releaseDate = getReleaseDate(model);
		return (
			<>
				<ProviderLogo
					id={model.provider?.provider_id ?? "unknown"}
					alt=""
					size="xxs"
					className="shrink-0"
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">{model.name}</span>
					{state.available ? (
						<OptionMeta model={model} monthLabel={releaseDate ? format.dateParts(releaseDate, { month: "short", year: "numeric", timeZone: "UTC" }) : null} />
					) : (
						<span className="block truncate text-xs text-muted-foreground">{reasonText(state)}</span>
					)}
				</span>
				<OptionStatus model={model} />
				{isSelected ? <Check aria-label={tView("selected")} className="size-4 shrink-0" /> : null}
			</>
		);
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
				{/* A plain input, not cmdk's: cmdk sets its own aria-activedescendant and aria-controls over ours, and the virtualised options aren't cmdk items. */}
				<div className="p-1 pb-0">
					<InputGroup className="h-8! bg-input/50">
						<input
							autoFocus
							type="text"
							role="combobox"
							aria-expanded
							aria-autocomplete="list"
							aria-controls={listboxId}
							aria-label={t("searchModels")}
							aria-activedescendant={resolvedActiveId ? getVirtualizedModelCatalogItemId(resolvedActiveId) : undefined}
							autoComplete="off"
							spellCheck={false}
							placeholder={t("searchModels")}
							value={searchTerm}
							onChange={(event) => {
								setSearchTerm(event.target.value);
								setActiveId(null);
							}}
							onKeyDown={onSearchKeyDown}
							className="h-auto w-full bg-transparent py-3.5 text-sm outline-hidden"
						/>
						<InputGroupAddon>
							<Search aria-hidden className="size-4 shrink-0 opacity-50" />
						</InputGroupAddon>
					</InputGroup>
				</div>
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
				{!searching && hiddenCount > 0 ? (
					<p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
						{tView("pickerHiddenIncompatible", { count: hiddenCount })}
					</p>
				) : null}
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
					<VirtualizedModelCatalog
						sections={sections}
						getItemKey={getOptionKey}
						activeItemKey={resolvedActiveId}
						isItemDisabled={(model) => !availability(model).available}
						onActiveItemChange={setActiveId}
						onSelectItem={(model) => toggleSelection(model.id)}
						renderItem={renderItem}
						estimateItemSize={48}
						emptyContent={t("noModelsFound")}
						listboxId={listboxId}
					/>
				)}
			</ModelSelectorContent>
		</ModelSelector>
	);
}

function getOptionKey(model: CompareModelOption): string {
	return model.id;
}
