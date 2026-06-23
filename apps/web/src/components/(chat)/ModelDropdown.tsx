"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
	getDefaultFavoriteModelIds,
	MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
	normalizeFavoriteModelId,
} from "./playgroundConfig";

export type ModelDropdownOption = {
	id: string;
	label: string;
	orgId: string;
	orgName: string;
	releaseDate?: string | null;
};

type ModelDropdownProps = {
	value: string;
	onValueChange?: (value: string) => void;
	options: ModelDropdownOption[];
	latestOptions?: ModelDropdownOption[];
	placeholder?: string;
	ariaLabel: string;
	className?: string;
	contentClassName?: string;
};

type ModelDropdownMode = "all" | "latest";

function normalizeSearch(value: string) {
	return value.toLowerCase().replace(/[\s._-]+/g, " ").trim();
}

function formatReleaseMonth(date: string | null | undefined) {
	if (!date) return "Models";
	const parsed = new Date(date);
	if (!Number.isFinite(parsed.getTime())) return "Models";
	return parsed.toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});
}

function selectedLabel(
	value: string,
	options: ModelDropdownOption[],
	placeholder: string,
) {
	if (!value.trim()) return placeholder;
	return options.find((option) => option.id === value)?.label ?? value;
}

export function ModelDropdown({
	value,
	onValueChange,
	options,
	latestOptions = [],
	placeholder = "Select model",
	ariaLabel,
	className,
	contentClassName,
}: ModelDropdownProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<ModelDropdownMode>("all");
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);
	const selected = value.trim();
	const allOptions = useMemo(
		() => [...latestOptions, ...options],
		[latestOptions, options],
	);
	const availableFavoriteIds = useMemo(
		() =>
			new Set(
				allOptions.map((option) => normalizeFavoriteModelId(option.id)),
			),
		[allOptions],
	);
	const readFavoriteModelIds = useCallback(() => {
		const defaults = getDefaultFavoriteModelIds().filter((id) =>
			availableFavoriteIds.has(id),
		);
		if (typeof window === "undefined") return new Set(defaults);
		const raw = window.localStorage.getItem(
			MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
		);
		if (!raw) return new Set(defaults);
		try {
			const parsed = JSON.parse(raw);
			const next = Array.isArray(parsed)
				? parsed
						.map((value) => normalizeFavoriteModelId(String(value)))
						.filter((id) => availableFavoriteIds.has(id))
				: [];
			return new Set(next);
		} catch {
			return new Set(defaults);
		}
	}, [availableFavoriteIds]);
	useEffect(() => {
		setFavoriteModelIdSet(readFavoriteModelIds());
	}, [readFavoriteModelIds]);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const handleStorage = (event: StorageEvent) => {
			if (event.key === MODEL_SELECTOR_FAVORITES_STORAGE_KEY) {
				setFavoriteModelIdSet(readFavoriteModelIds());
			}
		};
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, [readFavoriteModelIds]);
	const hasLatestOptions = latestOptions.length > 0;
	const selectedIsLatest = latestOptions.some(
		(option) => option.id === selected,
	);
	const visibleOptions = mode === "latest" ? latestOptions : options;
	const normalizedQuery = normalizeSearch(query);
	const filteredOptions = useMemo(() => {
		if (!normalizedQuery) return visibleOptions;
		const terms = normalizedQuery.split(/\s+/).filter(Boolean);
		return visibleOptions.filter((option) => {
			const haystack = normalizeSearch(
				[
					option.id,
					option.label,
					option.orgId,
					option.orgName,
				].join(" "),
			);
			return terms.every((term) => haystack.includes(term));
		});
	}, [normalizedQuery, visibleOptions]);
	const groupedOptions = useMemo(() => {
		if (mode === "latest") {
			if (filteredOptions.length === 0) return [];
			return [
				{
					heading: "Latest aliases",
					items: filteredOptions,
				},
			];
		}
		const favoriteIds = Array.from(favoriteModelIdSet);
		const normalizedQueryIsEmpty = normalizedQuery.length === 0;
		const byFavoriteId = new Map(
			filteredOptions.map((option) => [
				normalizeFavoriteModelId(option.id),
				option,
			]),
		);
		const favoriteOptions = normalizedQueryIsEmpty
			? favoriteIds
					.map((favoriteModelId) => byFavoriteId.get(favoriteModelId))
					.filter(
						(option): option is ModelDropdownOption => Boolean(option),
					)
			: [];
		const groups = new Map<string, ModelDropdownOption[]>();
		for (const option of filteredOptions.filter(
			(option) =>
				!normalizedQueryIsEmpty ||
				!favoriteModelIdSet.has(normalizeFavoriteModelId(option.id)),
		)) {
			const heading = formatReleaseMonth(option.releaseDate);
			groups.set(heading, [...(groups.get(heading) ?? []), option]);
		}
		const dateGroups = Array.from(groups.entries()).map(([heading, items]) => ({
			heading,
			items,
		}));
		return favoriteOptions.length > 0
			? [{ heading: "Favourites", items: favoriteOptions }, ...dateGroups]
			: dateGroups;
	}, [favoriteModelIdSet, filteredOptions, mode, normalizedQuery]);
	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setFavoriteModelIdSet(readFavoriteModelIds());
			setMode(selectedIsLatest ? "latest" : "all");
		}
		setOpen(nextOpen);
	};
	const choose = (nextValue: string) => {
		onValueChange?.(nextValue);
		setOpen(false);
		setQuery("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label={ariaLabel}
					className={cn(
						"h-8 w-full justify-between gap-2 px-2 text-left font-normal",
						className,
					)}
				>
					<span className="flex min-w-0 items-center gap-2">
						{selected ? (
							<Logo
								id={
									allOptions.find((option) => option.id === selected)
										?.orgId ?? selected.split("/")[0] ?? "ai-stats"
								}
								alt={selectedLabel(selected, allOptions, placeholder)}
								width={16}
								height={16}
								className="h-4 w-4 shrink-0 rounded-none object-contain"
							/>
						) : null}
						<span className="truncate text-sm">
							{selectedLabel(selected, allOptions, placeholder)}
						</span>
					</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className={cn("w-[390px] p-0", contentClassName)}
			>
				<div className="flex h-11 items-center gap-2 border-b border-border px-3">
					<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search models"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>
				{hasLatestOptions ? (
					<div className="border-b border-border px-2 py-2">
						<div className="grid grid-cols-2 rounded-md bg-muted p-0.5">
							{(["all", "latest"] as const).map((nextMode) => (
								<button
									key={nextMode}
									type="button"
									className={cn(
										"h-7 rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors",
										mode === nextMode &&
											"bg-background text-foreground shadow-sm",
									)}
									onClick={() => setMode(nextMode)}
								>
									{nextMode === "all" ? "All" : "Latest"}
								</button>
							))}
						</div>
					</div>
				) : null}
				<ScrollArea className="h-[360px]">
					<div className="py-1">
						{groupedOptions.length === 0 ? (
							<div className="px-3 py-6 text-center text-sm text-muted-foreground">
								No models found.
							</div>
						) : null}
						{groupedOptions.map((group) => (
							<div key={group.heading}>
								<div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
									{group.heading}
								</div>
								{group.items.map((option) => {
									const isSelected = option.id === selected;
									return (
										<button
											key={option.id}
											type="button"
											className={cn(
												"flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted",
												isSelected && "bg-muted/70",
											)}
											onClick={() => choose(option.id)}
										>
											<Logo
												id={option.orgId}
												alt={option.orgName}
												width={16}
												height={16}
												className="h-4 w-4 shrink-0 rounded-none object-contain"
											/>
											<span className="min-w-0 flex-1 truncate">
												{option.label}
											</span>
											{isSelected ? (
												<Check className="h-3.5 w-3.5 shrink-0" />
											) : null}
										</button>
									);
								})}
							</div>
						))}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
