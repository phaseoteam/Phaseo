"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ArrowRight,
	ArrowUpDown,
	Grid as GridIcon,
	Layers as LayersIcon,
	Search,
	Table as TableIcon,
} from "lucide-react";
import type { ModelCollection } from "@/lib/fetchers/collections/getCollections";

type CollectionsDisplayProps = {
	collections: ModelCollection[];
};

type CollectionsSortOption =
	| "featured"
	| "name_asc"
	| "models_desc"
	| "newest_model";

const SORT_LABELS: Record<CollectionsSortOption, string> = {
	featured: "Featured",
	name_asc: "Name (A-Z)",
	models_desc: "Most Models",
	newest_model: "Newest Models",
};

const COLLECTION_SORT_OPTIONS: CollectionsSortOption[] = [
	"featured",
	"name_asc",
	"models_desc",
	"newest_model",
];

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
});

type EnrichedCollection = ModelCollection & {
	featuredRank: number;
	newestModelTimestamp: number;
	newestModelDateLabel: string | null;
	searchIndex: string;
};

function deriveNewestModelTimestamp(collection: ModelCollection): number {
	return collection.models.reduce((max, model) => {
		const timestamp =
			Number.isFinite(model.primary_timestamp) && model.primary_timestamp
				? Number(model.primary_timestamp)
				: 0;
		return Math.max(max, timestamp);
	}, 0);
}

function formatNewestModelDate(timestamp: number): string | null {
	if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
	try {
		return DATE_FORMATTER.format(new Date(timestamp));
	} catch {
		return null;
	}
}

function enrichCollections(collections: ModelCollection[]): EnrichedCollection[] {
	return collections.map((collection, index) => {
		const newestModelTimestamp = deriveNewestModelTimestamp(collection);

		const searchIndex = [
			collection.title,
			collection.description,
			collection.hint ?? "",
			...collection.models.map((model) => model.name),
			...collection.models.map((model) => model.model_id),
		]
			.join(" ")
			.toLowerCase();

		return {
			...collection,
			featuredRank: index,
			newestModelTimestamp,
			newestModelDateLabel: formatNewestModelDate(newestModelTimestamp),
			searchIndex,
		};
	});
}

export default function CollectionsDisplay({ collections }: CollectionsDisplayProps) {
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<CollectionsSortOption>("featured");
	const deferredSearch = useDeferredValue(search);

	const preparedCollections = useMemo(
		() => enrichCollections(collections),
		[collections],
	);

	const filteredCollections = useMemo(() => {
		const query = deferredSearch.trim().toLowerCase();
		const filtered = query
			? preparedCollections.filter((collection) =>
					collection.searchIndex.includes(query),
				)
			: preparedCollections;

		return [...filtered].sort((a, b) => {
			switch (sort) {
				case "name_asc":
					return a.title.localeCompare(b.title);
				case "models_desc": {
					const byCount = b.models.length - a.models.length;
					if (byCount !== 0) return byCount;
					return a.title.localeCompare(b.title);
				}
				case "newest_model": {
					const byNewest = b.newestModelTimestamp - a.newestModelTimestamp;
					if (byNewest !== 0) return byNewest;
					return a.title.localeCompare(b.title);
				}
				case "featured":
				default:
					return a.featuredRank - b.featuredRank;
			}
		});
	}, [deferredSearch, preparedCollections, sort]);

	const shownCountLabel = `${filteredCollections.length.toLocaleString()} shown`;
	const shownCountWithSearchLabel = deferredSearch
		? `${shownCountLabel} for "${deferredSearch}"`
		: shownCountLabel;
	const mdPlaceholderCount =
		filteredCollections.length > 0 && filteredCollections.length % 2 !== 0 ? 1 : 0;
	const widePlaceholderCount =
		filteredCollections.length > 0
			? (3 - (filteredCollections.length % 3)) % 3
			: 0;

	const viewSwitcher = (
		<div className="inline-flex rounded-md overflow-hidden border bg-background">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						asChild
						variant="outline"
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
					>
						<Link href="/models" aria-label="Card view">
							<GridIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Card view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						asChild
						variant="outline"
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
					>
						<Link href="/models/table" aria-label="Table view">
							<TableIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Table view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						asChild
						variant="default"
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
					>
						<Link href="/models/collections" aria-label="Collections view">
							<LayersIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Collections</TooltipContent>
			</Tooltip>
		</div>
	);

	return (
		<section className="min-w-0 flex flex-1 flex-col">
			<div className="shrink-0 border-b border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur lg:px-8">
				<div className="sm:hidden space-y-2">
					<div className="flex items-center justify-between gap-2">
						<h1 className="font-bold text-xl leading-8">Collections</h1>
						<div className="flex items-center gap-2">{viewSwitcher}</div>
					</div>
					<div className="relative w-full">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
						<Input
							placeholder="Search collections"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm w-full"
						/>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm text-muted-foreground tabular-nums">
							{shownCountLabel}
						</span>
						<div className="flex items-center gap-1">
							<span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
							<Select
								value={sort}
								onValueChange={(value) =>
									setSort(value as CollectionsSortOption)
								}
							>
								<SelectTrigger className="h-8 w-[170px] rounded-md bg-background text-sm">
									<SelectValue placeholder="Sort" />
								</SelectTrigger>
								<SelectContent align="end">
									{COLLECTION_SORT_OPTIONS.map((option) => (
										<SelectItem key={option} value={option}>
											{SORT_LABELS[option]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<div className="hidden sm:block">
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(260px,460px)_auto] sm:items-center sm:gap-3">
						<div className="min-w-0 sm:flex sm:h-8 sm:items-center">
							<h1 className="font-bold text-xl leading-8">Collections</h1>
						</div>
						<div className="relative w-full sm:justify-self-center">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<Input
								placeholder="Search collections"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm w-full"
							/>
						</div>
						<div className="flex items-center justify-end gap-2 sm:justify-self-end">
							{viewSwitcher}
						</div>
					</div>

					<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
						<div className="text-sm text-muted-foreground">
							{shownCountWithSearchLabel}
						</div>
						<div className="flex items-center gap-2">
							<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
								<ArrowUpDown className="h-3.5 w-3.5" />
								Sort
							</span>
							<Select
								value={sort}
								onValueChange={(value) =>
									setSort(value as CollectionsSortOption)
								}
							>
								<SelectTrigger className="h-8 w-[190px] rounded-md bg-background text-sm">
									<SelectValue placeholder="Sort" />
								</SelectTrigger>
								<SelectContent align="end">
									{COLLECTION_SORT_OPTIONS.map((option) => (
										<SelectItem key={option} value={option}>
											{SORT_LABELS[option]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
			</div>

			<div className="w-full px-4 pt-2 pb-5 lg:px-8 lg:pt-2 lg:pb-6">
				{filteredCollections.length === 0 ? (
					<div className="rounded-xl border bg-card px-4 py-12 text-center text-muted-foreground">
						No collections match your search.
					</div>
				) : (
					<div className="bg-border/70">
						<div className="grid grid-cols-1 gap-px md:grid-cols-2 2xl:grid-cols-3">
							{filteredCollections.map((collection) => (
								<Link
									key={collection.id}
									href={`/models/collections/${collection.id}`}
									className="group block bg-background px-4 py-4 transition-colors hover:bg-muted/20 md:px-5 md:py-5"
								>
									<div className="flex h-full flex-col justify-between gap-4">
										<div className="flex items-start justify-between gap-4">
											<div className="min-w-0 space-y-2">
												<h2 className="text-base font-semibold leading-tight group-hover:underline underline-offset-4 decoration-[1px]">
													{collection.title}
												</h2>
												<p className="text-sm text-muted-foreground">
													{collection.description}
												</p>
												{collection.hint ? (
													<p className="text-xs text-muted-foreground">
														{collection.hint}
													</p>
												) : null}
											</div>
											<ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
										</div>
										<div className="flex flex-wrap items-center gap-2 pt-0.5">
											<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
												{collection.models.length} model
												{collection.models.length === 1 ? "" : "s"}
											</span>
											{collection.newestModelDateLabel ? (
												<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
													Newest {collection.newestModelDateLabel}
												</span>
											) : null}
										</div>
									</div>
								</Link>
							))}
							{Array.from({ length: mdPlaceholderCount }).map((_, index) => (
								<div
									key={`collections-md-placeholder-${index}`}
									className="hidden bg-background md:block 2xl:hidden"
									aria-hidden
								/>
							))}
							{Array.from({ length: widePlaceholderCount }).map((_, index) => (
								<div
									key={`collections-wide-placeholder-${index}`}
									className="hidden bg-background 2xl:block"
									aria-hidden
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
