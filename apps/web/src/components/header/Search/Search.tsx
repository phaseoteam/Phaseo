"use client";

import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Search as SearchIcon, Sparkles } from "lucide-react";
import { curatedGroups } from "./Search.constants";
import { SearchRowItem } from "./SearchRowItem";
import type {
	CompactSearchData,
	SearchData,
} from "@/lib/fetchers/search/getSearchData";

interface Props {
	className?: string;
	initialData?: SearchData | null;
}

type SearchableItem = {
	id: string;
	title: string;
	subtitle?: string | null;
	href?: string;
	logoId?: string | null;
	flagIso?: string;
};

function normalizeSearchTerm(value: string): string {
	return value
		.toLowerCase()
		.replace(/[\s._-]+/g, " ")
		.replace(/[^a-z0-9 ]/g, "")
		.trim();
}

function buildSearchKeywords(item: SearchableItem): string[] {
	const keywords = new Set<string>();
	const terms = [
		item.id,
		item.title,
		item.subtitle,
		item.href,
		item.logoId,
		item.flagIso,
	];

	for (const term of terms) {
		if (!term) continue;

		keywords.add(term);

		const normalized = normalizeSearchTerm(term);
		if (normalized) keywords.add(normalized);

		const dotted = term.replace(/-/g, ".");
		const dashed = term.replace(/\./g, "-");
		const compact = term.replace(/[\s._-]+/g, "");

		keywords.add(dotted);
		keywords.add(dashed);
		keywords.add(compact);
		keywords.add(normalizeSearchTerm(dotted));
		keywords.add(normalizeSearchTerm(dashed));
		keywords.add(normalizeSearchTerm(compact));
	}

	return Array.from(keywords).filter(Boolean);
}

let cachedSearchData: SearchData | null = null;
let searchDataRequest: Promise<SearchData> | null = null;

function isCompactSearchData(value: unknown): value is CompactSearchData {
	return Boolean(
		value &&
			typeof value === "object" &&
			Array.isArray((value as CompactSearchData).m) &&
			Array.isArray((value as CompactSearchData).o) &&
			Array.isArray((value as CompactSearchData).b) &&
			Array.isArray((value as CompactSearchData).p) &&
			Array.isArray((value as CompactSearchData).s) &&
			Array.isArray((value as CompactSearchData).c),
	);
}

function expandSearchData(value: SearchData | CompactSearchData): SearchData {
	if (!isCompactSearchData(value)) return value;

	return {
		models: value.m.map(([id, title, subtitle, href, logoId]) => ({
			id,
			title,
			subtitle,
			href,
			logoId,
		})),
		organisations: value.o.map(([id, title, subtitle, href, logoId]) => ({
			id,
			title,
			subtitle,
			href,
			logoId,
		})),
		benchmarks: value.b.map(([id, title, subtitle, href]) => ({
			id,
			title,
			subtitle,
			href,
		})),
		apiProviders: value.p.map(([id, title, subtitle, href, logoId]) => ({
			id,
			title,
			subtitle,
			href,
			logoId,
		})),
		subscriptionPlans: value.s.map(([id, title, subtitle, href, logoId]) => ({
			id,
			title,
			subtitle,
			href,
			logoId,
		})),
		countries: value.c.map(([id, title, subtitle, href, flagIso]) => ({
			id,
			title,
			subtitle,
			href,
			flagIso,
		})),
	};
}

async function fetchSearchData(): Promise<SearchData> {
	if (cachedSearchData) return cachedSearchData;
	if (searchDataRequest) return searchDataRequest;

	searchDataRequest = fetch("/api/frontend/search", {
		method: "GET",
		cache: "force-cache",
		credentials: "same-origin",
	})
		.then(async (response) => {
			if (!response.ok) {
				throw new Error("Failed to load search data");
			}
			return expandSearchData(
				(await response.json()) as SearchData | CompactSearchData,
			);
		})
		.then((data) => {
			cachedSearchData = data;
			return data;
		})
		.finally(() => {
			searchDataRequest = null;
		});

	return searchDataRequest;
}

function getMatchScore(item: SearchableItem, term: string): number {
	const rawTerm = term.trim().toLowerCase();
	const normalizedTerm = normalizeSearchTerm(rawTerm);
	const itemId = item.id.toLowerCase();
	const itemTitle = item.title.toLowerCase();
	const normalizedItemId = normalizeSearchTerm(item.id);
	const normalizedItemTitle = normalizeSearchTerm(item.title);
	const hasNormalizedTerm = normalizedTerm.length > 0;

	if (itemTitle === rawTerm || (hasNormalizedTerm && normalizedItemTitle === normalizedTerm)) {
		return 1000;
	}
	if (itemId === rawTerm || (hasNormalizedTerm && normalizedItemId === normalizedTerm)) {
		return 900;
	}
	if (
		itemTitle.startsWith(rawTerm) ||
		(hasNormalizedTerm && normalizedItemTitle.startsWith(normalizedTerm))
	) {
		return 800;
	}
	if (
		itemId.startsWith(rawTerm) ||
		(hasNormalizedTerm && normalizedItemId.startsWith(normalizedTerm))
	) {
		return 700;
	}
	if (
		itemTitle.includes(rawTerm) ||
		(hasNormalizedTerm && normalizedItemTitle.includes(normalizedTerm))
	) {
		return 600;
	}
	if (
		itemId.includes(rawTerm) ||
		(hasNormalizedTerm && normalizedItemId.includes(normalizedTerm))
	) {
		return 500;
	}
	if (
		buildSearchKeywords(item).some((keyword) => {
			const keywordLower = keyword.toLowerCase();
			if (keywordLower.includes(rawTerm)) return true;
			if (!hasNormalizedTerm) return false;
			return normalizeSearchTerm(keyword).includes(normalizedTerm);
		})
	) {
		return 400;
	}

	return 0;
}

function filterAndSort<T extends SearchableItem>(items: T[], term: string): T[] {
	if (!term) return [];

	return items
		.map((item) => ({ item, score: getMatchScore(item, term) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}

			return left.item.title.localeCompare(right.item.title);
		})
		.map(({ item }) => item)
		.slice(0, 50);
}

export default function Search({ className, initialData = null }: Props) {
	const router = useRouter();
	const listRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [searchData, setSearchData] = useState<SearchData | null>(
		initialData ?? cachedSearchData
	);
	const [isLoadingSearchData, setIsLoadingSearchData] = useState(false);
	const [searchDataError, setSearchDataError] = useState<string | null>(null);

	useEffect(() => {
		if (!initialData) return;
		cachedSearchData = initialData;
		setSearchData(initialData);
	}, [initialData]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const hasModifier = event.metaKey || event.ctrlKey;
			if (!hasModifier || event.key.toLowerCase() !== "k") return;

			event.preventDefault();
			setOpen((value) => !value);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		if (listRef.current) {
			listRef.current.scrollTop = 0;
		}
	}, [query]);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setIsLoadingSearchData(false);
			return;
		}

		setSearchDataError(null);
	}, [open]);

	useEffect(() => {
		if (!open || searchData || searchDataError) return;

		let cancelled = false;
		setIsLoadingSearchData(true);

		void fetchSearchData()
			.then((data) => {
				if (cancelled) return;
				setSearchData(data);
			})
			.catch(() => {
				if (cancelled) return;
				setSearchDataError("Unable to load search data.");
			})
			.finally(() => {
				if (cancelled) return;
				setIsLoadingSearchData(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open, searchData, searchDataError]);

	const handleSelect = (href: string) => {
		setOpen(false);
		router.push(href);
	};

	const hasQuery = query.trim().length > 0;
	const searchTerm = query.trim().toLowerCase();

	const orderedCategories = useMemo(() => {
		if (!hasQuery || !searchData) return [];

		const models = filterAndSort(searchData.models, searchTerm);
		const organisations = filterAndSort(searchData.organisations, searchTerm);
		const benchmarks = filterAndSort(searchData.benchmarks, searchTerm);
		const providers = filterAndSort(searchData.apiProviders, searchTerm);
		const plans = filterAndSort(searchData.subscriptionPlans, searchTerm);
		const countries = filterAndSort(searchData.countries, searchTerm);

		return [
			{ name: "models", items: models, score: models.length ? getMatchScore(models[0], searchTerm) : 0 },
			{ name: "organisations", items: organisations, score: organisations.length ? getMatchScore(organisations[0], searchTerm) : 0 },
			{ name: "benchmarks", items: benchmarks, score: benchmarks.length ? getMatchScore(benchmarks[0], searchTerm) : 0 },
			{ name: "providers", items: providers, score: providers.length ? getMatchScore(providers[0], searchTerm) : 0 },
			{ name: "plans", items: plans, score: plans.length ? getMatchScore(plans[0], searchTerm) : 0 },
			{ name: "countries", items: countries, score: countries.length ? getMatchScore(countries[0], searchTerm) : 0 },
		]
			.filter((category) => category.items.length > 0)
			.sort((left, right) => right.score - left.score);
	}, [hasQuery, searchData, searchTerm]);

	return (
		<div className={cn("flex items-center", className)}>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="relative flex h-[var(--site-header-control-h,2.25rem)] w-[var(--site-header-control-h,2.25rem)] items-center justify-center rounded-lg border border-zinc-200/80 bg-white px-0 text-left text-sm text-zinc-500 shadow-none transition-[border-color,color,background-color] hover:border-zinc-300 hover:text-zinc-700 xl:w-full xl:justify-start xl:pl-9 xl:pr-12 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
				aria-label="Open search"
			>
				<SearchIcon className="pointer-events-none absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-zinc-400 xl:left-3 xl:translate-x-0 dark:text-zinc-500" />
				<span className="hidden truncate font-medium xl:inline">Search</span>
				<span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 xl:inline-flex dark:border-zinc-800 dark:text-zinc-400">
					Ctrl K
				</span>
			</button>

			<CommandDialog open={open} onOpenChange={setOpen}>
				<DialogTitle className="sr-only">Search</DialogTitle>
				<CommandInput
					value={query}
					onValueChange={setQuery}
					placeholder="Search models, organisations, benchmarks..."
					aria-label="Search catalogue"
				/>
				<CommandList ref={listRef} className="max-h-[60vh] lg:max-h-[70vh]">
					<CommandEmpty className="py-12">
						<div className="flex flex-col items-center gap-3">
							<div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
								<SearchIcon className="size-6 text-zinc-400" />
							</div>
							<div className="text-center">
								{isLoadingSearchData ? (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											Loading search index...
										</p>
										<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
											This only loads once per session.
										</p>
									</>
								) : searchDataError ? (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											{searchDataError}
										</p>
										<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
											Close and reopen search to retry.
										</p>
									</>
								) : (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											No results found
										</p>
										<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
											Try different keywords or check your spelling.
										</p>
									</>
								)}
							</div>
						</div>
					</CommandEmpty>

					{!hasQuery && curatedGroups[0] ? (
						<>
							<CommandGroup heading={curatedGroups[0].label}>
								{curatedGroups[0].items.map((item) => (
									<CommandItem
										key={item.id}
										value={item.href}
										onSelect={() => handleSelect(item.href)}
										className="flex items-center gap-3 px-3 py-2.5"
									>
										<Sparkles className="size-[18px] shrink-0 text-zinc-400" />
										<span className="text-sm font-medium">{item.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					) : null}

					{hasQuery ? (
						orderedCategories.map((category, index) => {
							const categoryConfig = {
								models: { heading: "Models", type: undefined },
								organisations: { heading: "Organisations", type: undefined },
								benchmarks: { heading: "Benchmarks", type: "benchmark" as const },
								providers: { heading: "API providers", type: undefined },
								plans: { heading: "Subscription plans", type: undefined },
								countries: { heading: "Countries", type: undefined },
							}[category.name as "models" | "organisations" | "benchmarks" | "providers" | "plans" | "countries"];

							const visibleGroupCount = orderedCategories.length;
							const isLast = index === visibleGroupCount - 1;

							return (
								<Fragment key={category.name}>
									<CommandGroup heading={categoryConfig.heading}>
										{category.items.map((item: any) => (
											<SearchRowItem
												key={item.id}
												{...item}
												keywords={buildSearchKeywords(item)}
												onSelect={handleSelect}
												type={categoryConfig.type}
											/>
										))}
									</CommandGroup>
									{!isLast ? <CommandSeparator /> : null}
								</Fragment>
							);
						})
					) : (
						<>
							{curatedGroups.slice(1).map((group) => {
								const itemType =
									group.type === "featured-benchmarks"
										? "benchmark"
										: group.type === "featured-comparisons"
											? "comparison"
											: "default";

								return (
									<Fragment key={group.type}>
										<CommandSeparator />
										<CommandGroup heading={group.label}>
											{group.items.map((item) => (
												<SearchRowItem
													key={item.id}
													id={item.id}
													title={item.title}
													subtitle={item.subtitle}
													href={item.href}
													logoId={item.logoId}
													flagIso={item.flagIso}
													leftLogoId={item.leftLogoId}
													rightLogoId={item.rightLogoId}
													keywords={[item.title, item.subtitle || ""].filter(Boolean)}
													onSelect={handleSelect}
													type={itemType}
												/>
											))}
										</CommandGroup>
									</Fragment>
								);
							})}
						</>
					)}
				</CommandList>
			</CommandDialog>
		</div>
	);
}

