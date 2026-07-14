"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import APIProviderCard from "./APIProviderCard";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, Search } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import type { APIProviderCard as APIProviderCardType } from "@/lib/fetchers/api-providers/getAllAPIProviders";

interface APIProvidersDisplayProps {
	providers: APIProviderCardType[];
	showPrimaryHeader?: boolean;
}

type ProviderSortOption =
	| "a_z"
	| "daily_tokens_desc"
	| "total_models_desc"
	| "free_models_desc";

const SORT_OPTION_LABELS: Record<ProviderSortOption, string> = {
	daily_tokens_desc: "Daily Tokens",
	total_models_desc: "Total Models",
	free_models_desc: "Free Models",
	a_z: "Name (A-Z)",
};

function normalizeSortOption(
	value: string | null | undefined,
): ProviderSortOption {
	switch (value) {
		case "daily_tokens_desc":
		case "total_models_desc":
		case "free_models_desc":
		case "a_z":
			return value;
		default:
			return "daily_tokens_desc";
	}
}

export default function APIProvidersDisplay({
	providers,
	showPrimaryHeader = true,
}: APIProvidersDisplayProps) {
	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
	});
	const [sort, setSort] = useQueryState("sort", {
		defaultValue: "daily_tokens_desc",
	});
	const sortOption = normalizeSortOption(sort);

	const filteredProviders = useMemo(() => {
		let filtered = providers;

		if (search.trim()) {
			const q = search.trim().toLowerCase();
			filtered = filtered.filter((p) =>
				p.api_provider_name.toLowerCase().includes(q),
			);
		}

		filtered = [...filtered].sort((a, b) => {
			if (sortOption === "daily_tokens_desc") {
				const tokenDelta =
					Number(b.total_daily_tokens ?? 0) -
					Number(a.total_daily_tokens ?? 0);
				if (tokenDelta !== 0) return tokenDelta;
				const monthlyTokenDelta =
					Number(b.total_monthly_tokens ?? 0) -
					Number(a.total_monthly_tokens ?? 0);
				if (monthlyTokenDelta !== 0) return monthlyTokenDelta;
			}
			if (sortOption === "total_models_desc") {
				const modelsDelta =
					Number(b.total_models ?? 0) - Number(a.total_models ?? 0);
				if (modelsDelta !== 0) return modelsDelta;
			}
			if (sortOption === "free_models_desc") {
				const freeDelta =
					Number(b.free_models ?? 0) - Number(a.free_models ?? 0);
				if (freeDelta !== 0) return freeDelta;
			}
			return a.api_provider_name.localeCompare(b.api_provider_name);
		});

		return filtered;
	}, [providers, search, sortOption]);

	const lgFillers = (2 - (filteredProviders.length % 2)) % 2;
	const twoXlFillers = (3 - (filteredProviders.length % 3)) % 3;

	return (
		<>
			<div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				{showPrimaryHeader ? (
					<h1 className="text-xl font-bold">API Providers</h1>
				) : (
					<div />
				)}
				<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
					<Select
						value={sortOption}
						onValueChange={(value) =>
							setSort(normalizeSortOption(value))
						}
					>
						<SelectTrigger
							className="h-9 w-full border border-border/70 bg-background shadow-xs hover:bg-muted/45 dark:border-border/70 dark:bg-background dark:hover:bg-muted/25 sm:w-[11rem]"
							aria-label="Sort providers"
						>
								<span className="flex min-w-0 items-center gap-2">
								<ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate">{SORT_OPTION_LABELS[sortOption]}</span>
							</span>
						</SelectTrigger>
						<SelectContent
							align="start"
							alignItemWithTrigger={false}
							className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
						>
							{(
								[
									"daily_tokens_desc",
									"total_models_desc",
									"free_models_desc",
									"a_z",
								] as ProviderSortOption[]
							).map((option) => (
								<SelectItem key={option} value={option}>
									{SORT_OPTION_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="relative w-full sm:w-[20rem]">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Search providers..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="h-9 w-full rounded-lg border border-border/70 bg-background py-1.5 pl-9 pr-2 text-sm shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
							style={{ minWidth: 0 }}
						/>
					</div>
				</div>
			</div>

			<div className="overflow-hidden rounded-xl border border-border/70 bg-border/70">
				{filteredProviders.length > 0 ? (
					<div className="grid grid-cols-1 gap-px lg:grid-cols-2 2xl:grid-cols-3">
						{filteredProviders.map((provider) => (
							<div
								key={provider.api_provider_id}
								className="bg-background"
							>
								<APIProviderCard api_provider={provider} />
							</div>
						))}
						{Array.from({ length: lgFillers }).map((_, index) => (
							<div
								key={`lg-filler-${index}`}
								aria-hidden="true"
								className="hidden bg-background lg:block 2xl:hidden"
							/>
						))}
						{Array.from({ length: twoXlFillers }).map((_, index) => (
							<div
								key={`2xl-filler-${index}`}
								aria-hidden="true"
								className="hidden bg-background 2xl:block"
							/>
						))}
					</div>
				) : (
					<div className="px-4 py-12 text-center text-muted-foreground">
						No API providers found for the selected filters.
					</div>
				)}
			</div>
		</>
	);
}
