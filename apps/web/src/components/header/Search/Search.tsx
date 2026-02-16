"use client";

import React, { Fragment, useEffect, useState } from "react";
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
}

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

export default function Search({ className }: Props) {
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [searchData, setSearchData] = useState<SearchData | null>(cachedSearchData);
	const [isLoadingSearchData, setIsLoadingSearchData] = useState(false);
	const [searchDataError, setSearchDataError] = useState<string | null>(null);
	const listRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			if (event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((value) => !value);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Scroll to top when search query changes
	useEffect(() => {
		if (listRef.current) {
			listRef.current.scrollTop = 0;
		}
	}, [query]);

	// Reset query when dialog closes
	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			setQuery("");
		}
	};

	useEffect(() => {
		if (!open || searchData || isLoadingSearchData) return;

		let cancelled = false;
		setIsLoadingSearchData(true);
		setSearchDataError(null);

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
	}, [open, searchData, isLoadingSearchData]);

	const handleSelect = (href: string) => {
		setOpen(false);
		router.push(href);
	};

	const hasQuery = query.trim().length > 0;
	const searchTerm = query.trim().toLowerCase();

	// Calculate match score for an item (higher = better match)
	const getMatchScore = (item: { id: string; title: string; searchKeywords: string[] }, term: string): number => {
		const itemId = item.id.toLowerCase();
		const itemTitle = item.title.toLowerCase();

		// Exact ID match (score: 1000)
		if (itemId === term) return 1000;

		// Exact title match (score: 900)
		if (itemTitle === term) return 900;

		// Title starts with term (score: 800)
		if (itemTitle.startsWith(term)) return 800;

		// ID starts with term (score: 700)
		if (itemId.startsWith(term)) return 700;

		// ID contains term (score: 600)
		if (itemId.includes(term)) return 600;

		// Title contains term (score: 500)
		if (itemTitle.includes(term)) return 500;

		// Keyword match (score: 400)
		if (item.searchKeywords.some(k => k.toLowerCase().includes(term))) return 400;

		return 0;
	};

	// Filter and sort function that prioritizes exact matches
	const filterAndSort = <T extends { id: string; title: string; searchKeywords: string[] }>(
		items: T[],
		term: string
	): T[] => {
		if (!term) return [];

		// Filter and score items
		const scored = items
			.map(item => ({ item, score: getMatchScore(item, term) }))
			.filter(({ score }) => score > 0);

		// Sort by score (descending), then alphabetically
		return scored
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.item.title.localeCompare(b.item.title);
			})
			.map(({ item }) => item)
			.slice(0, 50);
	};

	// Filter and sort data based on search query
	const modelsToShow = hasQuery && searchData ? filterAndSort(searchData.models, searchTerm) : [];
	const orgsToShow = hasQuery && searchData ? filterAndSort(searchData.organisations, searchTerm) : [];
	const benchmarksToShow = hasQuery && searchData ? filterAndSort(searchData.benchmarks, searchTerm) : [];
	const providersToShow = hasQuery && searchData ? filterAndSort(searchData.apiProviders, searchTerm) : [];
	const plansToShow = hasQuery && searchData ? filterAndSort(searchData.subscriptionPlans, searchTerm) : [];
	const countriesToShow = hasQuery && searchData ? filterAndSort(searchData.countries, searchTerm) : [];

	// Calculate best match score for each category to determine section order
	const categoryScores = [
		{ name: 'models', items: modelsToShow, score: modelsToShow.length > 0 ? getMatchScore(modelsToShow[0], searchTerm) : 0 },
		{ name: 'organisations', items: orgsToShow, score: orgsToShow.length > 0 ? getMatchScore(orgsToShow[0], searchTerm) : 0 },
		{ name: 'benchmarks', items: benchmarksToShow, score: benchmarksToShow.length > 0 ? getMatchScore(benchmarksToShow[0], searchTerm) : 0 },
		{ name: 'providers', items: providersToShow, score: providersToShow.length > 0 ? getMatchScore(providersToShow[0], searchTerm) : 0 },
		{ name: 'plans', items: plansToShow, score: plansToShow.length > 0 ? getMatchScore(plansToShow[0], searchTerm) : 0 },
		{ name: 'countries', items: countriesToShow, score: countriesToShow.length > 0 ? getMatchScore(countriesToShow[0], searchTerm) : 0 },
	].sort((a, b) => b.score - a.score); // Sort categories by best match score

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
				aria-label="Open search"
			>
				<SearchIcon className="size-4" />
			</button>

			<CommandDialog open={open} onOpenChange={handleOpenChange}>
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
							<div className="size-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
								<SearchIcon className="size-6 text-zinc-400" />
							</div>
							<div className="text-center">
								{isLoadingSearchData ? (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											Loading search index...
										</p>
										<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
											This only loads once per session.
										</p>
									</>
								) : searchDataError ? (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											{searchDataError}
										</p>
										<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
											Close and reopen search to retry.
										</p>
									</>
								) : (
									<>
										<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
											No results found
										</p>
										<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
											Try different keywords or check your spelling
										</p>
									</>
								)}
							</div>
						</div>
					</CommandEmpty>

					{/* Quick Actions - Always visible when no query */}
					{!hasQuery && curatedGroups[0] && (
						<>
							<CommandGroup heading={curatedGroups[0].label}>
								{curatedGroups[0].items.map((item) => (
									<CommandItem
										key={item.id}
										value={item.href}
										onSelect={() => handleSelect(item.href)}
										className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
									>
										<Sparkles className="size-[18px] shrink-0 text-zinc-400" />
										<span className="text-sm font-medium">{item.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Dynamically ordered search results */}
					{hasQuery && categoryScores.map((category, index) => {
						if (category.items.length === 0) return null;

						const categoryConfig = {
							models: { heading: 'Models', type: undefined },
							organisations: { heading: 'Organisations', type: undefined },
							benchmarks: { heading: 'Benchmarks', type: 'benchmark' as const },
							providers: { heading: 'API Providers', type: undefined },
							plans: { heading: 'Subscription Plans', type: undefined },
							countries: { heading: 'Countries', type: undefined },
						}[category.name];

						if (!categoryConfig) return null;

						const isLast = index === categoryScores.filter(c => c.items.length > 0).length - 1;

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
								{!isLast && <CommandSeparator />}
							</Fragment>
						);
					})}

					{/* Featured items when no query */}
					{!hasQuery && (
						<>
							{curatedGroups.slice(1).map((group) => {
								// Determine the type for each group
								const itemType = group.type === 'featured-benchmarks' ? 'benchmark' :
								                 group.type === 'featured-comparisons' ? 'comparison' :
								                 'default';

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
													keywords={[item.title, item.subtitle || ''].filter(Boolean)}
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
