"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpRight,
	Bolt,
	Compass,
	CornerDownLeft,
	ExternalLink,
	Pin,
	PinOff,
	Search as SearchIcon,
	Sparkles,
	Trophy,
} from "lucide-react";
import { GLOBAL_NAVIGATION_ITEMS } from "./Search.navigation";
import {
	EXTERNAL_RESOURCE_ITEMS,
	getContextItems,
	GLOBAL_ACTION_ITEMS,
	parsePaletteQuery,
} from "./Search.commands";
import {
	invalidatePinnedItemsCache,
	PINNED_STORAGE_KEY,
	readPinnedItems,
	togglePinnedItem,
	writePinnedItems,
} from "./Search.storage";
import type { PaletteItem } from "./Search.types";
import type {
	CompactSearchData,
	SearchData,
} from "@/lib/fetchers/search/types";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	canCheckSearchGeneration,
	searchIndexPath,
	wasAwayLongEnough,
} from "./Search.freshness";

interface Props {
	className?: string;
}

type SearchableItem = PaletteItem;

type SearchRowType =
	| "action"
	| "benchmark"
	| "comparison"
	| "context"
	| "default"
	| "navigation"
	| "resource";

type DefaultSearchCategory = {
	key: string;
	heading: string;
	items: SearchableItem[];
	type?: SearchRowType;
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
			rowType?: SearchRowType;
	}
	| {
			type: "separator";
			key: string;
	};

type SearchResultCategory = {
	name:
		| "actions"
		| "apiProviders"
		| "benchmarks"
		| "context"
		| "models"
		| "navigation"
		| "organisations"
		| "resources";
	items: SearchableItem[];
	score: number;
};

type SelectableSearchRow = {
	key: string;
	item: SearchableItem;
	listRowIndex?: number;
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
		...(item.keywords ?? []),
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
	items: readonly T[],
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
		models: value.m.map(([id, title, subtitle, href, logoId, releaseGroupLabel]) => ({
			id,
			title,
			subtitle,
			href,
			logoId,
			releaseGroupLabel,
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
		cacheGeneration: Math.max(1, Number(value.v ?? 1)),
	};
}

async function fetchSearchData(path: string): Promise<SearchData> {
	const response = await fetch(path, {
		method: "GET",
		credentials: "omit",
	});
	if (!response.ok) throw new Error("Failed to load search data");
	return expandSearchData(
		(await response.json()) as SearchData | CompactSearchData,
	);
}

let lastSearchGenerationCheckAt = 0;

const NAVIGATION_SEARCH_INDEX = createSearchIndex(GLOBAL_NAVIGATION_ITEMS);
const ACTION_SEARCH_INDEX = createSearchIndex(GLOBAL_ACTION_ITEMS);
const RESOURCE_SEARCH_INDEX = createSearchIndex(EXTERNAL_RESOURCE_ITEMS);
const KEYBOARD_SHORTCUT_ITEMS = [
	...GLOBAL_NAVIGATION_ITEMS,
	...GLOBAL_ACTION_ITEMS,
	...EXTERNAL_RESOURCE_ITEMS,
].filter((item) => item.shortcut);

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
	showAllWhenEmpty = false,
): T[] {
	if (!term) {
		return showAllWhenEmpty ? items.slice(0, limit).map(({ item }) => item) : [];
	}

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
	active = false,
	rowKey,
	onActive,
	type = "default",
	isPinned = false,
	onTogglePin,
}: {
	item: SearchableItem;
	showSubtitle?: boolean;
	onSelect: (item: SearchableItem) => void;
	active?: boolean;
	rowKey: string;
	onActive: () => void;
	type?: SearchRowType;
	isPinned?: boolean;
	onTogglePin?: (item: SearchableItem) => void;
}) {
	return (
		<div
			data-search-row-key={rowKey}
			onMouseEnter={onActive}
			className={cn(
				"group/search-row relative flex h-8 w-full items-center rounded-lg text-sm transition-colors hover:bg-muted",
				active && "bg-muted text-foreground",
			)}
		>
			<button
				type="button"
				onClick={() => onSelect(item)}
				onFocus={onActive}
				className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left outline-hidden"
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
				{item.shortcut ? (
					<KeyboardShortcut
						keys={item.shortcut}
						type="sequence"
						label={`Press ${item.shortcut[0]}, then ${item.shortcut[1]}`}
						className="hidden shrink-0 items-center gap-1 sm:flex"
						title={`Press ${item.shortcut[0]}, then ${item.shortcut[1]}`}
					/>
				) : null}
				{onTogglePin ? <span aria-hidden="true" className="size-6 shrink-0" /> : null}
				{item.external ? (
					<ExternalLink className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
				) : (
					<ArrowUpRight className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
				)}
			</button>
			{onTogglePin ? (
				<button
					type="button"
					onClick={() => onTogglePin(item)}
					aria-label={isPinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
					className={cn(
						"absolute right-7 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 opacity-0 outline-hidden transition hover:bg-background hover:text-zinc-700 focus-visible:opacity-100 group-hover/search-row:opacity-100 dark:hover:text-zinc-200",
						isPinned && "opacity-100 text-zinc-700 dark:text-zinc-200",
					)}
				>
					{isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
				</button>
			) : null}
		</div>
	);
}

function SearchFooter({
	count,
	label,
}: {
	count: number;
	label: string;
}) {
	return (
		<div className="-mx-2 -mb-2 mt-1 flex h-8 items-center justify-between rounded-b-[1.35rem] border-t border-border/60 bg-background px-3 text-[11px] text-muted-foreground">
			<div className="flex min-w-0 items-center gap-2">
				<span className="inline-flex items-center gap-1">
					<Kbd className="size-4 rounded p-0">
						<ArrowUp className="size-3" />
					</Kbd>
					<Kbd className="size-4 rounded p-0">
						<ArrowDown className="size-3" />
					</Kbd>
					<span>move</span>
				</span>
				<span className="inline-flex items-center gap-1">
					<Kbd className="size-4 rounded p-0">
						<CornerDownLeft className="size-3" />
					</Kbd>
					<span>select</span>
				</span>
			</div>
			<span className="shrink-0 tabular-nums">
				{count.toLocaleString()} {label}
			</span>
		</div>
	);
}

function SearchBrowseIcon({
	item,
	type = "default",
}: {
	item: SearchableItem;
	type?: SearchRowType;
}) {
	const persistedType = item.id.startsWith("nav-")
		? "navigation"
		: item.id.startsWith("action-")
			? "action"
			: item.id.startsWith("context-")
				? "context"
				: item.id.startsWith("resource-")
					? "resource"
					: "default";
	const effectiveType = type === "default" ? persistedType : type;

	if (effectiveType === "action" || effectiveType === "context") {
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
				{effectiveType === "context" ? <Sparkles className="size-3" /> : <Bolt className="size-3" />}
			</div>
		);
	}

	if (effectiveType === "resource") {
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
				<ExternalLink className="size-3" />
			</div>
		);
	}

	if (effectiveType === "navigation") {
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
				<Compass className="size-3" />
			</div>
		);
	}

	if (effectiveType === "benchmark") {
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

export default function Search({ className }: Props) {
	const router = useRouter();
	const pathname = usePathname() ?? "/";
	const { resolvedTheme, setTheme } = useTheme();
	const listRef = useRef<HTMLDivElement>(null);
	const queryUpdateTimeoutRef = useRef<number | null>(null);
	const inputValueRef = useRef("");
	const awaySinceRef = useRef<number | null>(null);
	const searchGenerationRef = useRef(1);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeRowIndex, setActiveRowIndex] = useState(0);
	const {
		data: searchData,
		error: searchDataFetchError,
		isLoading: isLoadingSearchData,
		mutate: mutateSearchData,
	} = useSWR(open ? publicSWRKeys.search : null, fetchSearchData, {
		dedupingInterval: 24 * 60 * 60 * 1_000,
		revalidateIfStale: false,
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
	});
	searchGenerationRef.current = searchData?.cacheGeneration ?? 1;
	const searchDataError = searchDataFetchError
		? "Unable to load search data."
		: null;
	const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
	const [pinnedItems, setPinnedItems] = useState<PaletteItem[]>([]);
	const contextItems = useMemo(() => getContextItems(pathname), [pathname]);

	useEffect(() => {
		setPinnedItems(readPinnedItems());

		function onStorage(event: StorageEvent) {
			if (
				event.storageArea !== window.localStorage ||
				(event.key !== PINNED_STORAGE_KEY && event.key !== null)
			) return;
			invalidatePinnedItemsCache();
			setPinnedItems(readPinnedItems());
		}

		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	useEffect(() => {
		function markAway() {
			awaySinceRef.current ??= Date.now();
		}

		function maybeRefreshAfterAway() {
			if (!searchData) return;
			const now = Date.now();
			const awaySince = awaySinceRef.current;
			awaySinceRef.current = null;
			if (!wasAwayLongEnough(awaySince, now)) return;
			if (!canCheckSearchGeneration(lastSearchGenerationCheckAt, now)) return;
			lastSearchGenerationCheckAt = now;

			void fetch("/api/_web/cache-generation/search", {
				method: "GET",
				credentials: "omit",
			})
				.then(async (response) => {
					if (!response.ok) throw new Error("Failed to check search generation");
					const payload = await response.json() as { generation?: unknown };
					return Math.max(1, Number(payload.generation ?? 1));
				})
				.then(async (generation) => {
					if (generation <= searchGenerationRef.current) return;
					await mutateSearchData(
						fetchSearchData(searchIndexPath(generation)),
						{ revalidate: false },
					);
				})
				.catch(() => {
					// The existing index remains usable; the next eligible focus can retry.
				});
		}

		function onVisibilityChange() {
			if (document.visibilityState === "hidden") markAway();
			else maybeRefreshAfterAway();
		}

		if (document.visibilityState === "hidden") markAway();
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("blur", markAway);
		window.addEventListener("focus", maybeRefreshAfterAway);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("blur", markAway);
			window.removeEventListener("focus", maybeRefreshAfterAway);
		};
	}, [mutateSearchData, searchData]);

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
			inputValueRef.current = "";
			setQuery("");
		}
	}, [open]);

	useEffect(() => {
		return () => {
			if (queryUpdateTimeoutRef.current) {
				window.clearTimeout(queryUpdateTimeoutRef.current);
			}
		};
	}, []);

	const handleSelect = useCallback((item: SearchableItem) => {
		if (item.action) {
			switch (item.action) {
				case "copy-current-url":
					void navigator.clipboard.writeText(window.location.href);
					break;
				case "copy-text":
					if (item.actionValue) void navigator.clipboard.writeText(item.actionValue);
					break;
				case "theme-dark":
					setTheme("dark");
					break;
				case "theme-light":
					setTheme("light");
					break;
				case "theme-system":
					setTheme("system");
					break;
				case "theme-toggle":
					setTheme(resolvedTheme === "dark" ? "light" : "dark");
					break;
			}
			setOpen(false);
			return;
		}

		if (!item.href) return;
		setOpen(false);
		if (item.external) {
			window.open(item.href, "_blank", "noopener,noreferrer");
			return;
		}
		router.push(item.href);
	}, [resolvedTheme, router, setTheme]);

	const handleTogglePin = useCallback((item: SearchableItem) => {
		setPinnedItems((currentItems) => {
			const nextItems = togglePinnedItem(currentItems, item);
			return writePinnedItems(nextItems);
		});
	}, []);

	useEffect(() => {
		if (open) return;
		let pendingKey = "";
		let resetTimer: number | null = null;

		function resetChord() {
			pendingKey = "";
			if (resetTimer) window.clearTimeout(resetTimer);
			resetTimer = null;
		}

		function onShortcut(event: KeyboardEvent) {
			if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || target.matches("input, textarea, select"))
			) return;

			const key = event.key.toUpperCase();
			if (key.length !== 1) return;
			if (pendingKey) {
				const item = KEYBOARD_SHORTCUT_ITEMS.find(
					(candidate) => candidate.shortcut?.[0] === pendingKey && candidate.shortcut[1] === key,
				);
				resetChord();
				if (!item) return;
				event.preventDefault();
				handleSelect(item);
				return;
			}

			if (!KEYBOARD_SHORTCUT_ITEMS.some((item) => item.shortcut?.[0] === key)) return;
			event.preventDefault();
			pendingKey = key;
			resetTimer = window.setTimeout(resetChord, 900);
		}

		window.addEventListener("keydown", onShortcut);
		return () => {
			window.removeEventListener("keydown", onShortcut);
			if (resetTimer) window.clearTimeout(resetTimer);
		};
	}, [handleSelect, open]);

	const handleQueryChange = (value: string) => {
		inputValueRef.current = value;

		if (queryUpdateTimeoutRef.current) {
			window.clearTimeout(queryUpdateTimeoutRef.current);
		}

		queryUpdateTimeoutRef.current = window.setTimeout(() => {
			setQuery(value);
			queryUpdateTimeoutRef.current = null;
		}, 80);
	};

	const hasQuery = query.trim().length > 0;
	const { scope: searchScope, term: searchTerm } = useMemo(
		() => parsePaletteQuery(query),
		[query],
	);

	const searchIndex = useMemo<SearchIndex | null>(() => {
		if (!searchData) return null;

		return {
			models: createSearchIndex(searchData.models),
			apiProviders: createSearchIndex(searchData.apiProviders),
			organisations: createSearchIndex(searchData.organisations),
			benchmarks: createSearchIndex(searchData.benchmarks),
		};
	}, [searchData]);
	const contextSearchIndex = useMemo(() => createSearchIndex(contextItems), [contextItems]);

	const orderedCategories = useMemo<SearchResultCategory[]>(() => {
		if (!hasQuery) return [];

		const resultLimit = searchTerm.length <= 1
			? 8
			: searchTerm.length <= 2
				? 12
				: 24;
		const showAllWhenScoped = searchTerm.length === 0 && searchScope !== "all";
		const includesScope = (scope: typeof searchScope) =>
			searchScope === "all" || searchScope === scope;
		const navigation = includesScope("navigation")
			? filterAndSortIndexed(NAVIGATION_SEARCH_INDEX, searchTerm, 12, showAllWhenScoped)
			: [];
		const actions = includesScope("actions")
			? filterAndSortIndexed(ACTION_SEARCH_INDEX, searchTerm, 12, showAllWhenScoped)
			: [];
		const context = includesScope("actions")
			? filterAndSortIndexed(contextSearchIndex, searchTerm, 8, showAllWhenScoped)
			: [];
		const resources = includesScope("resources")
			? filterAndSortIndexed(RESOURCE_SEARCH_INDEX, searchTerm, 12, showAllWhenScoped)
			: [];
		const models = includesScope("models") && searchIndex
			? filterAndSortIndexed(searchIndex.models, searchTerm, resultLimit, showAllWhenScoped)
			: [];
		const providers = searchScope === "all" && searchIndex
			? filterAndSortIndexed(searchIndex.apiProviders, searchTerm, resultLimit)
			: [];
		const organisations = searchScope === "all" && searchIndex
			? filterAndSortIndexed(searchIndex.organisations, searchTerm, resultLimit)
			: [];
		const benchmarks = searchScope === "all" && searchIndex
			? filterAndSortIndexed(searchIndex.benchmarks, searchTerm, resultLimit)
			: [];

		return [
			{
				name: "context" as const,
				items: context,
				score: getFirstResultScore(contextSearchIndex, context, searchTerm),
			},
			{
				name: "actions" as const,
				items: actions,
				score: getFirstResultScore(ACTION_SEARCH_INDEX, actions, searchTerm),
			},
			{
				name: "navigation" as const,
				items: navigation,
				score: getFirstResultScore(NAVIGATION_SEARCH_INDEX, navigation, searchTerm),
			},
			{
				name: "resources" as const,
				items: resources,
				score: getFirstResultScore(RESOURCE_SEARCH_INDEX, resources, searchTerm),
			},
			{
				name: "models" as const,
				items: models,
				score: searchIndex
					? getFirstResultScore(searchIndex.models, models, searchTerm)
					: 0,
			},
			{
				name: "apiProviders" as const,
				items: providers,
				score: searchIndex
					? getFirstResultScore(searchIndex.apiProviders, providers, searchTerm)
					: 0,
			},
			{
				name: "organisations" as const,
				items: organisations,
				score: searchIndex
					? getFirstResultScore(searchIndex.organisations, organisations, searchTerm)
					: 0,
			},
			{
				name: "benchmarks" as const,
				items: benchmarks,
				score: searchIndex
					? getFirstResultScore(searchIndex.benchmarks, benchmarks, searchTerm)
					: 0,
			},
		]
			.filter((category) => category.items.length > 0)
			.sort((left, right) => right.score - left.score);
	}, [contextSearchIndex, hasQuery, searchIndex, searchScope, searchTerm]);

	const defaultCategories = useMemo<DefaultSearchCategory[]>(() => {
		if (hasQuery) return [];

		return [
			{
				key: "pinned",
				heading: "Pinned",
				items: pinnedItems,
			},
			{
				key: "models",
				heading: "Models",
				items: searchData?.models ?? [],
				showSubtitle: false,
			},
			{
				key: "context",
				heading: "On this page",
				items: contextItems,
				type: "context" as const,
			},
			{
				key: "quick-actions",
				heading: "Quick actions",
				items: GLOBAL_ACTION_ITEMS.slice(0, 7),
				type: "action" as const,
			},
			{
				key: "resources",
				heading: "Resources",
				items: EXTERNAL_RESOURCE_ITEMS.slice(0, 4),
				type: "resource" as const,
			},
			{
				key: "apiProviders",
				heading: "API Providers",
				items: searchData?.apiProviders ?? [],
			},
		].filter((category) => category.items.length > 0);
	}, [contextItems, hasQuery, pinnedItems, searchData]);

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
					rowType: category.type,
				})),
			];

			if (index < defaultCategories.length - 1) {
				rows.push({ type: "separator", key: `${category.key}-separator` });
			}

			return rows;
		});
	}, [defaultCategories, hasQuery]);

	const selectableRows = useMemo<SelectableSearchRow[]>(() => {
		if (hasQuery) {
			return orderedCategories.flatMap((category) =>
				category.items.map((item) => ({
					key: `${category.name}-${item.id}`,
					item,
				})),
			);
		}

		return defaultBrowseRows.flatMap((row, listRowIndex) =>
			row.type === "item"
				? [
						{
							key: row.key,
							item: row.item,
							listRowIndex,
						},
					]
				: [],
		);
	}, [defaultBrowseRows, hasQuery, orderedCategories]);

	const activeRow = selectableRows[activeRowIndex] ?? selectableRows[0] ?? null;
	const pinnedItemIds = useMemo(
		() => new Set(pinnedItems.map((item) => item.id)),
		[pinnedItems],
	);

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
	const footerCount = hasQuery
		? visibleSearchRowCount
		: selectableRows.length;
	const footerLabel = hasQuery
		? footerCount === 1
			? "result"
			: "results"
		: "items";

	useEffect(() => {
		setActiveRowIndex(0);
	}, [hasQuery, searchScope, searchTerm]);

	useEffect(() => {
		if (activeRowIndex < selectableRows.length) return;
		setActiveRowIndex(Math.max(0, selectableRows.length - 1));
	}, [activeRowIndex, selectableRows.length]);

	useEffect(() => {
		if (!open || !activeRow) return;

		if (!hasQuery && activeRow.listRowIndex != null) {
			defaultBrowseVirtualizer.scrollToIndex(activeRow.listRowIndex, {
				align: "auto",
			});
			return;
		}

		Array.from(
			listRef.current?.querySelectorAll<HTMLElement>("[data-search-row-key]") ??
				[],
		)
			.find((element) => element.dataset.searchRowKey === activeRow.key)
			?.scrollIntoView({ block: "nearest" });
	}, [activeRow, defaultBrowseVirtualizer, hasQuery, open]);

	const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveRowIndex((value) =>
				selectableRows.length === 0
					? 0
					: Math.min(value + 1, selectableRows.length - 1),
			);
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveRowIndex((value) => Math.max(value - 1, 0));
			return;
		}

		if (event.key === "Enter" && activeRow) {
			event.preventDefault();

			const nextQuery = parsePaletteQuery(inputValueRef.current);
			if (nextQuery.term !== searchTerm || nextQuery.scope !== searchScope) {
				if (queryUpdateTimeoutRef.current) {
					window.clearTimeout(queryUpdateTimeoutRef.current);
					queryUpdateTimeoutRef.current = null;
				}
				setQuery(inputValueRef.current);
				setActiveRowIndex(0);
				return;
			}

			handleSelect(activeRow.item);
		}
	};

	const getSelectableRowIndex = (key: string) =>
		selectableRows.findIndex((row) => row.key === key);

	return (
		<div className={cn("flex items-center", className)}>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="relative flex h-[var(--site-header-control-h,2.25rem)] w-[var(--site-header-control-h,2.25rem)] items-center justify-center rounded-lg border border-zinc-200/80 bg-white px-0 text-left text-sm text-zinc-500 shadow-none transition-[border-color,color,background-color] hover:border-zinc-300 hover:text-zinc-700 xl:w-full xl:justify-start xl:pl-9 xl:pr-12 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
				aria-label="Open command palette"
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
					className="top-1/2 flex w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)]! -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-3xl! p-2 sm:top-1/2 sm:w-[34rem] sm:max-w-[34rem]!"
				>
					<DialogTitle className="sr-only">Search</DialogTitle>
					<div className="mb-1">
						<InputGroup className="h-9! bg-input/50">
							<InputGroupAddon>
								<SearchIcon className="size-4 shrink-0 opacity-50" />
							</InputGroupAddon>
							<InputGroupInput
								key={open ? "global-search-open" : "global-search-closed"}
								onChange={(event) => handleQueryChange(event.currentTarget.value)}
								onKeyDown={handleSearchKeyDown}
								placeholder="Search, or use > / @ ? ..."
								aria-label="Search Phaseo and run commands"
								autoFocus
								className="text-sm"
							/>
							<InputGroupAddon align="inline-end">
								<Kbd>esc</Kbd>
							</InputGroupAddon>
						</InputGroup>
					</div>
					<div
						className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 text-[11px] text-muted-foreground"
						aria-label="Command prefixes"
					>
						<span className="inline-flex items-center gap-1"><Kbd>&gt;</Kbd> actions</span>
						<span className="inline-flex items-center gap-1"><Kbd>/</Kbd> pages</span>
						<span className="inline-flex items-center gap-1"><Kbd>@</Kbd> models</span>
						<span className="inline-flex items-center gap-1"><Kbd>?</Kbd> resources</span>
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
											actions: { heading: "Actions", type: "action" as const, showSubtitle: true },
											context: { heading: "On this page", type: "context" as const, showSubtitle: true },
											navigation: { heading: "Navigation", type: "navigation" as const, showSubtitle: true },
											resources: { heading: "External resources", type: "resource" as const, showSubtitle: true },
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
															rowKey={`${category.name}-${item.id}`}
															item={item}
															showSubtitle={categoryConfig.showSubtitle}
															type={categoryConfig.type}
															active={activeRow?.key === `${category.name}-${item.id}`}
															onActive={() => {
																const nextIndex = getSelectableRowIndex(
																	`${category.name}-${item.id}`,
																);
																if (nextIndex >= 0) setActiveRowIndex(nextIndex);
															}}
															onSelect={handleSelect}
															isPinned={pinnedItemIds.has(item.id)}
															onTogglePin={handleTogglePin}
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
														rowKey={row.key}
														item={row.item}
														showSubtitle={row.showSubtitle}
														type={row.rowType}
														active={activeRow?.key === row.key}
														onActive={() => {
															const nextIndex = getSelectableRowIndex(row.key);
															if (nextIndex >= 0) setActiveRowIndex(nextIndex);
														}}
														onSelect={handleSelect}
														isPinned={pinnedItemIds.has(row.item.id)}
														onTogglePin={handleTogglePin}
													/>
												)}
											</div>
										);
									})}
								</div>
							)}
						</ScrollArea>
					</div>
					<SearchFooter count={footerCount} label={footerLabel} />
				</DialogContent>
			</Dialog>
		</div>
	);
}

