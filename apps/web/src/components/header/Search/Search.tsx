"use client";

import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Search as SearchIcon, Trophy } from "lucide-react";
import type { SearchData } from "@/lib/fetchers/search/getSearchData";

interface Props {
	className?: string;
	initialData?: SearchData | null;
}

type SearchableItem = {
	id: string;
	title: string;
	subtitle?: string | null;
	href: string;
	logoId?: string | null;
	flagIso?: string;
};

type DefaultSearchCategory = {
	key: string;
	heading: string;
	items: SearchableItem[];
	type?: "benchmark" | "comparison" | "default";
	showSubtitle?: boolean;
};

type DefaultBrowseRow =
	| {
			type: "heading";
			key: string;
			heading: string;
	  }
	| {
			type: "item";
			key: string;
			item: SearchableItem;
			showSubtitle?: boolean;
	  }
	| {
			type: "separator";
			key: string;
	  };

type SearchResultCategory = {
	name: "models" | "apiProviders" | "organisations" | "benchmarks";
	items: SearchableItem[];
	score: number;
};

type IndexedSearchItem<T extends SearchableItem> = {
	item: T;
	idLower: string;
	titleLower: string;
	normalizedId: string;
	normalizedTitle: string;
	keywordBlob: string;
};

type SearchIndex = {
	models: IndexedSearchItem<SearchData["models"][number]>[];
	apiProviders: IndexedSearchItem<SearchData["apiProviders"][number]>[];
	organisations: IndexedSearchItem<SearchData["organisations"][number]>[];
	benchmarks: IndexedSearchItem<SearchData["benchmarks"][number]>[];
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

function createSearchIndex<T extends SearchableItem>(
	items: T[],
): IndexedSearchItem<T>[] {
	return items.map((item) => ({
		item,
		idLower: item.id.toLowerCase(),
		titleLower: item.title.toLowerCase(),
		normalizedId: normalizeSearchTerm(item.id),
		normalizedTitle: normalizeSearchTerm(item.title),
		keywordBlob: buildSearchKeywords(item)
			.map((keyword) => keyword.toLowerCase())
			.join(" "),
	}));
}

let cachedSearchData: SearchData | null = null;

function getIndexedMatchScore<T extends SearchableItem>(
	indexedItem: IndexedSearchItem<T>,
	term: string,
): number {
	const rawTerm = term.trim().toLowerCase();
	const normalizedTerm = normalizeSearchTerm(rawTerm);
	const hasNormalizedTerm = normalizedTerm.length > 0;

	if (
		indexedItem.titleLower === rawTerm ||
		(hasNormalizedTerm && indexedItem.normalizedTitle === normalizedTerm)
	) {
		return 1000;
	}
	if (
		indexedItem.idLower === rawTerm ||
		(hasNormalizedTerm && indexedItem.normalizedId === normalizedTerm)
	) {
		return 900;
	}
	if (
		indexedItem.titleLower.startsWith(rawTerm) ||
		(hasNormalizedTerm && indexedItem.normalizedTitle.startsWith(normalizedTerm))
	) {
		return 800;
	}
	if (
		indexedItem.idLower.startsWith(rawTerm) ||
		(hasNormalizedTerm && indexedItem.normalizedId.startsWith(normalizedTerm))
	) {
		return 700;
	}
	if (
		indexedItem.titleLower.includes(rawTerm) ||
		(hasNormalizedTerm && indexedItem.normalizedTitle.includes(normalizedTerm))
	) {
		return 600;
	}
	if (
		indexedItem.idLower.includes(rawTerm) ||
		(hasNormalizedTerm && indexedItem.normalizedId.includes(normalizedTerm))
	) {
		return 500;
	}
	if (
		indexedItem.keywordBlob.includes(rawTerm) ||
		(hasNormalizedTerm && indexedItem.keywordBlob.includes(normalizedTerm))
	) {
		return 400;
	}

	return 0;
}

function filterAndSortIndexed<T extends SearchableItem>(
	items: IndexedSearchItem<T>[],
	term: string,
	limit: number,
): T[] {
	if (!term) return [];

	return items
		.map((indexedItem) => ({
			item: indexedItem.item,
			score: getIndexedMatchScore(indexedItem, term),
		}))
		.filter(({ score }) => score > 0)
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}

			return left.item.title.localeCompare(right.item.title);
		})
		.map(({ item }) => item)
		.slice(0, limit);
}

function getFirstResultScore<T extends SearchableItem>(
	indexedItems: IndexedSearchItem<T>[],
	results: T[],
	term: string,
): number {
	const firstResult = results[0];
	if (!firstResult) return 0;

	const indexedItem = indexedItems.find((candidate) => candidate.item.id === firstResult.id);
	return indexedItem ? getIndexedMatchScore(indexedItem, term) : 0;
}

function SearchBrowseRow({
	item,
	showSubtitle = true,
	onSelect,
	type = "default",
}: {
	item: SearchableItem;
	showSubtitle?: boolean;
	onSelect: (href: string) => void;
	type?: "benchmark" | "comparison" | "default";
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(item.href)}
			className="flex h-8 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-hidden transition-colors hover:bg-muted focus-visible:bg-muted"
		>
			<SearchBrowseIcon item={item} type={type} />
			<div className="min-w-0 flex flex-1 items-baseline gap-2">
				<span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
					{item.title}
				</span>
				{showSubtitle && item.subtitle ? (
					<span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
						{item.subtitle}
					</span>
				) : null}
			</div>
			<ArrowUpRight className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
		</button>
	);
}

function SearchBrowseIcon({
	item,
	type = "default",
}: {
	item: SearchableItem;
	type?: "benchmark" | "comparison" | "default";
}) {
	if (type === "benchmark") {
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
				<Trophy className="size-3" />
			</div>
		);
	}

	if (item.flagIso) {
		return (
			<div className="relative aspect-4/3 h-5 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
				<img
					src={`/flags/${item.flagIso}.svg`}
					alt={item.title}
					className="h-full w-full rounded-sm object-cover"
				/>
			</div>
		);
	}

	if (item.logoId) {
		return (
			<div className="relative flex size-5 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
				<div className="relative size-3.5">
					<Logo id={item.logoId} alt={item.title} className="object-contain" fill />
				</div>
			</div>
		);
	}

	return <div className="size-5 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-700" />;
}

function SearchEmptyState({
	isLoading,
	error,
}: {
	isLoading: boolean;
	error: string | null;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-12">
			<div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
				<SearchIcon className="size-6 text-zinc-400" />
			</div>
			<div className="text-center">
				{isLoading ? (
					<>
						<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
							Loading search index...
						</p>
						<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
							This only loads once per session.
						</p>
					</>
				) : error ? (
					<>
						<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
							{error}
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
	);
}

export default function Search({ className, initialData = null }: Props) {
	const router = useRouter();
	const listRef = useRef<HTMLDivElement>(null);
	const queryUpdateTimeoutRef = useRef<number | null>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [searchData, setSearchData] = useState<SearchData | null>(
		initialData ?? cachedSearchData
	);
	const [isLoadingSearchData, setIsLoadingSearchData] = useState(false);
	const [searchDataError, setSearchDataError] = useState<string | null>(null);
	const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);

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
		const viewport = listRef.current?.querySelector<HTMLElement>(
			"[data-slot='scroll-area-viewport']",
		);
		if (viewport) {
			viewport.scrollTop = 0;
		}
	}, [query]);

	useEffect(() => {
		if (!open) {
			if (queryUpdateTimeoutRef.current) {
				window.clearTimeout(queryUpdateTimeoutRef.current);
				queryUpdateTimeoutRef.current = null;
			}
			setQuery("");
			setIsLoadingSearchData(false);
			return;
		}

		setSearchDataError(null);
	}, [open]);

	useEffect(() => {
		if (!open || searchData || searchDataError) return;
		setSearchDataError("Unable to load search data.");
	}, [open, searchData, searchDataError]);

	useEffect(() => {
		return () => {
			if (queryUpdateTimeoutRef.current) {
				window.clearTimeout(queryUpdateTimeoutRef.current);
			}
		};
	}, []);

	const handleSelect = (href: string) => {
		setOpen(false);
		router.push(href);
	};

	const handleQueryChange = (value: string) => {
		if (queryUpdateTimeoutRef.current) {
			window.clearTimeout(queryUpdateTimeoutRef.current);
		}

		queryUpdateTimeoutRef.current = window.setTimeout(() => {
			setQuery(value);
			queryUpdateTimeoutRef.current = null;
		}, 80);
	};

	const hasQuery = query.trim().length > 0;
	const searchTerm = query.trim().toLowerCase();

	const searchIndex = useMemo<SearchIndex | null>(() => {
		if (!searchData) return null;

		return {
			models: createSearchIndex(searchData.models),
			apiProviders: createSearchIndex(searchData.apiProviders),
			organisations: createSearchIndex(searchData.organisations),
			benchmarks: createSearchIndex(searchData.benchmarks),
		};
	}, [searchData]);

	const orderedCategories = useMemo<SearchResultCategory[]>(() => {
		if (!hasQuery || !searchIndex) return [];
		if (!searchTerm) return [];

		const resultLimit = searchTerm.length <= 1
			? 8
			: searchTerm.length <= 2
				? 12
				: 24;
		const models = filterAndSortIndexed(searchIndex.models, searchTerm, resultLimit);
		const providers = filterAndSortIndexed(searchIndex.apiProviders, searchTerm, resultLimit);
		const organisations = filterAndSortIndexed(searchIndex.organisations, searchTerm, resultLimit);
		const benchmarks = filterAndSortIndexed(searchIndex.benchmarks, searchTerm, resultLimit);

		return [
			{
				name: "models" as const,
				items: models,
				score: getFirstResultScore(searchIndex.models, models, searchTerm),
			},
			{
				name: "apiProviders" as const,
				items: providers,
				score: getFirstResultScore(searchIndex.apiProviders, providers, searchTerm),
			},
			{
				name: "organisations" as const,
				items: organisations,
				score: getFirstResultScore(searchIndex.organisations, organisations, searchTerm),
			},
			{
				name: "benchmarks" as const,
				items: benchmarks,
				score: getFirstResultScore(searchIndex.benchmarks, benchmarks, searchTerm),
			},
		]
			.filter((category) => category.items.length > 0)
			.sort((left, right) => right.score - left.score);
	}, [hasQuery, searchIndex, searchTerm]);

	const defaultCategories = useMemo<DefaultSearchCategory[]>(() => {
		if (hasQuery || !searchData) return [];

		const modelGroups = new Map<string, SearchableItem[]>();
		for (const model of searchData.models) {
			const heading = model.releaseGroupLabel ?? "Unknown Release Date";
			const models = modelGroups.get(heading) ?? [];
			models.push(model);
			modelGroups.set(heading, models);
		}

		return [
			...Array.from(modelGroups.entries()).map(([heading, items]) => ({
				key: `models-${heading}`,
				heading,
				items,
				showSubtitle: false,
			})),
			{
				key: "apiProviders",
				heading: "API Providers",
				items: searchData.apiProviders,
			},
		].filter((category) => category.items.length > 0);
	}, [hasQuery, searchData]);

	const defaultBrowseRows = useMemo<DefaultBrowseRow[]>(() => {
		if (hasQuery) return [];

		return defaultCategories.flatMap((category, index) => {
			const rows: DefaultBrowseRow[] = [
				{
					type: "heading",
					key: `${category.key}-heading`,
					heading: category.heading,
				},
				...category.items.map((item) => ({
					type: "item" as const,
					key: `${category.key}-${item.id}`,
					item,
					showSubtitle: category.showSubtitle,
				})),
			];

			if (index < defaultCategories.length - 1) {
				rows.push({ type: "separator", key: `${category.key}-separator` });
			}

			return rows;
		});
	}, [defaultCategories, hasQuery]);

	const defaultBrowseVirtualizer = useVirtualizer({
		count: defaultBrowseRows.length,
		getScrollElement: () => scrollViewport,
		estimateSize: (index) => {
			const row = defaultBrowseRows[index];
			if (row?.type === "heading") return 30;
			if (row?.type === "separator") return 9;
			return 32;
		},
		overscan: 14,
	});

	const visibleSearchRowCount = orderedCategories.reduce(
		(total, category) => total + category.items.length,
		0,
	);

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

			<Dialog
				open={open}
				onOpenChange={setOpen}
			>
				<DialogContent
					showCloseButton={false}
					className="top-1/2 flex w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)]! -translate-y-1/2 flex-col gap-1 overflow-hidden rounded-3xl! p-2 sm:top-1/2 sm:w-[34rem] sm:max-w-[34rem]!"
				>
					<DialogTitle className="sr-only">Search</DialogTitle>
					<div>
						<InputGroup className="h-9! bg-input/50">
							<InputGroupAddon>
								<SearchIcon className="size-4 shrink-0 opacity-50" />
							</InputGroupAddon>
							<InputGroupInput
								key={open ? "global-search-open" : "global-search-closed"}
								onChange={(event) => handleQueryChange(event.currentTarget.value)}
								placeholder="Search Phaseo..."
								aria-label="Search catalogue"
								autoFocus
								className="text-sm"
							/>
						</InputGroup>
					</div>
					<div ref={listRef} className="overflow-hidden outline-none">
						<ScrollArea
							className="h-[60vh] lg:h-[70vh]"
							viewportClassName="pr-2"
							viewportRef={setScrollViewport}
							keepScrollbarMounted
						>
							{hasQuery ? (
								visibleSearchRowCount === 0 ? (
									<SearchEmptyState
										isLoading={isLoadingSearchData}
										error={searchDataError}
									/>
								) : (
									orderedCategories.map((category, index) => {
										const categoryConfig = {
											models: { heading: "Models", type: undefined, showSubtitle: false },
											apiProviders: { heading: "API Providers", type: undefined, showSubtitle: true },
											organisations: { heading: "Organisations", type: undefined, showSubtitle: true },
											benchmarks: { heading: "Benchmarks", type: "benchmark" as const, showSubtitle: true },
										}[category.name];

										const isLast = index === orderedCategories.length - 1;

										return (
											<Fragment key={category.name}>
												<div className="p-1">
													<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
														{categoryConfig.heading}
													</div>
													{category.items.map((item) => (
														<SearchBrowseRow
															key={item.id}
															item={item}
															showSubtitle={categoryConfig.showSubtitle}
															type={categoryConfig.type}
															onSelect={handleSelect}
														/>
													))}
												</div>
												{!isLast ? <div className="my-1 h-px bg-border/50" /> : null}
											</Fragment>
										);
									})
								)
							) : defaultBrowseRows.length === 0 ? (
								<SearchEmptyState
									isLoading={isLoadingSearchData}
									error={searchDataError}
								/>
							) : (
								<div
									className="relative w-full"
									style={{ height: `${defaultBrowseVirtualizer.getTotalSize()}px` }}
								>
									{defaultBrowseVirtualizer.getVirtualItems().map((virtualRow) => {
										const row = defaultBrowseRows[virtualRow.index];
										if (!row) return null;

										return (
											<div
												key={row.key}
												className="absolute left-0 top-0 w-full"
												style={{ transform: `translateY(${virtualRow.start}px)` }}
											>
												{row.type === "heading" ? (
													<div className="flex h-[30px] items-center px-2 text-xs font-medium text-muted-foreground">
														{row.heading}
													</div>
												) : row.type === "separator" ? (
													<div className="my-1 h-px bg-border/50" />
												) : (
													<SearchBrowseRow
														item={row.item}
														showSubtitle={row.showSubtitle}
														onSelect={handleSelect}
													/>
												)}
											</div>
										);
									})}
								</div>
							)}
						</ScrollArea>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

