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
	ArrowLeft,
	ArrowUpDown,
	Grid as GridIcon,
	Layers as LayersIcon,
	Search,
	Table as TableIcon,
} from "lucide-react";
import type { ModelCollection } from "@/lib/fetchers/collections/getCollections";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { ModelsGrid } from "@/components/(data)/models/Models/ModelsGrid";

type CollectionDetailDisplayProps = {
	collection: ModelCollection;
};

type CollectionModelSortOption =
	| "newest"
	| "name_asc"
	| "popular_week"
	| "context_high_to_low"
	| "price_low_to_high";

const SORT_LABELS: Record<CollectionModelSortOption, string> = {
	newest: "Newest",
	name_asc: "Name (A-Z)",
	popular_week: "Most Popular (7d Tokens)",
	context_high_to_low: "Context: High to Low",
	price_low_to_high: "Price: Low to High",
};

const SORT_OPTIONS: CollectionModelSortOption[] = [
	"newest",
	"name_asc",
	"popular_week",
	"context_high_to_low",
	"price_low_to_high",
];

function getModelContext(model: ModelCard): number | null {
	const values = (model.context_lengths ?? [])
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (values.length === 0) return null;
	return Math.max(...values);
}

function getModelSortPrice(model: ModelCard): number | null {
	const candidates = [model.lowest_input_price, model.lowest_output_price]
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (candidates.length === 0) return null;
	return Math.min(...candidates);
}

function compareNullableNumber(
	a: number | null | undefined,
	b: number | null | undefined,
	direction: "asc" | "desc",
): number {
	const hasA = Number.isFinite(Number(a));
	const hasB = Number.isFinite(Number(b));
	if (!hasA && !hasB) return 0;
	if (!hasA) return 1;
	if (!hasB) return -1;
	return direction === "asc" ? Number(a) - Number(b) : Number(b) - Number(a);
}

function modelSearchIndex(model: ModelCard): string {
	return [
		model.name,
		model.model_id,
		model.organisation_name ?? "",
		...(model.gateway_api_model_ids ?? []),
	]
		.join(" ")
		.toLowerCase();
}

export default function CollectionDetailDisplay({
	collection,
}: CollectionDetailDisplayProps) {
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<CollectionModelSortOption>("newest");
	const deferredSearch = useDeferredValue(search);

	const filteredModels = useMemo(() => {
		const query = deferredSearch.trim().toLowerCase();
		const searched = query
			? collection.models.filter((model) =>
					modelSearchIndex(model).includes(query),
				)
			: collection.models;

		return [...searched].sort((a, b) => {
			switch (sort) {
				case "name_asc":
					return a.name.localeCompare(b.name);
				case "popular_week":
					return compareNullableNumber(
						a.popularity_tokens_week ?? null,
						b.popularity_tokens_week ?? null,
						"desc",
					);
				case "context_high_to_low":
					return compareNullableNumber(
						getModelContext(a),
						getModelContext(b),
						"desc",
					);
				case "price_low_to_high":
					return compareNullableNumber(
						getModelSortPrice(a),
						getModelSortPrice(b),
						"asc",
					);
				case "newest":
				default:
					return compareNullableNumber(
						a.primary_timestamp ?? null,
						b.primary_timestamp ?? null,
						"desc",
					);
			}
		});
	}, [collection.models, deferredSearch, sort]);

	const shownCountLabel = `${filteredModels.length.toLocaleString()} shown`;
	const shownCountWithSearchLabel = deferredSearch
		? `${shownCountLabel} for "${deferredSearch}"`
		: shownCountLabel;

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
						<div className="min-w-0">
							<h1 className="font-bold text-xl leading-8 truncate">Collections</h1>
						</div>
						{viewSwitcher}
					</div>
					<Button
						variant="ghost"
						size="sm"
						asChild
						className="h-7 px-1 text-muted-foreground justify-start"
					>
						<Link href="/models/collections">
							<ArrowLeft className="h-4 w-4" />
							Back to all collections
						</Link>
					</Button>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold leading-tight">{collection.title}</h2>
						<p className="text-sm text-muted-foreground">{collection.description}</p>
						{collection.hint ? (
							<p className="text-xs text-muted-foreground">{collection.hint}</p>
						) : null}
					</div>
					<div className="relative w-full">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
						<Input
							placeholder="Search models in collection"
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
									setSort(value as CollectionModelSortOption)
								}
							>
								<SelectTrigger className="h-8 w-[210px] rounded-md bg-background text-sm">
									<SelectValue placeholder="Sort" />
								</SelectTrigger>
								<SelectContent align="end">
									{SORT_OPTIONS.map((option) => (
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
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0 flex-1">
							<Button
								variant="ghost"
								size="sm"
								asChild
								className="mb-1 h-7 px-1 text-muted-foreground"
							>
								<Link href="/models/collections">
									<ArrowLeft className="h-4 w-4" />
									Back to all collections
								</Link>
							</Button>
							<h1 className="font-bold text-xl leading-8 truncate">{collection.title}</h1>
							<p className="text-sm text-muted-foreground">{collection.description}</p>
							{collection.hint ? (
								<p className="text-xs text-muted-foreground">{collection.hint}</p>
							) : null}
						</div>
						<div className="shrink-0">{viewSwitcher}</div>
					</div>

					<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(280px,460px)_auto] sm:items-center">
						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<Input
								placeholder="Search models in collection"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm w-full"
							/>
						</div>
						<div className="flex items-center justify-end gap-2">
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
										setSort(value as CollectionModelSortOption)
									}
								>
									<SelectTrigger className="h-8 w-[230px] rounded-md bg-background text-sm">
										<SelectValue placeholder="Sort" />
									</SelectTrigger>
									<SelectContent align="end">
										{SORT_OPTIONS.map((option) => (
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
			</div>

			<div className="w-full px-4 pt-2 pb-5 lg:px-8 lg:pt-2 lg:pb-6">
				<ModelsGrid filteredModels={filteredModels} />
			</div>
		</section>
	);
}

