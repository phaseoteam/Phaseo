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
import type { SearchData } from "@/lib/fetchers/search/getSearchData";

interface Props {
	className?: string;
	initialData?: SearchData | null;
}

type SearchableItem = {
	id: string;
	title: string;
	searchKeywords: string[];
};

let cachedSearchData: SearchData | null = null;
let searchDataRequest: Promise<SearchData> | null = null;

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
			return (await response.json()) as SearchData;
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
	const itemId = item.id.toLowerCase();
	const itemTitle = item.title.toLowerCase();

	if (itemId === term) return 1000;
	if (itemTitle === term) return 900;
	if (itemTitle.startsWith(term)) return 800;
	if (itemId.startsWith(term)) return 700;
	if (itemId.includes(term)) return 600;
	if (itemTitle.includes(term)) return 500;
	if (item.searchKeywords.some((keyword) => keyword.toLowerCase().includes(term))) {
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
				className="relative flex h-10 w-full items-center rounded-lg border border-zinc-200 bg-white pl-10 pr-16 text-left text-sm text-zinc-500 shadow-none transition-[border-color,box-shadow] hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700"
				aria-label="Open search"
			>
				<SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
				<span className="truncate">Search...</span>
				<span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 lg:inline-flex dark:border-zinc-800 dark:text-zinc-400">
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
												keywords={item.searchKeywords}
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

