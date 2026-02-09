import { Suspense } from "react";
import ModelsDisplay from "@/components/(data)/models/Models/ModelsDisplay";
import {
	getModelsFiltered,
	ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import { loadModelsSearchParams } from "./search-params";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { UPCOMING_TAB_VALUE, UNKNOWN_TAB_VALUE } from "@/lib/models/modelTabs";

export const metadata: Metadata = {
	title: "AI models - Compare Benchmarks, Pricing & Providers",
	description:
		"Explore a comprehensive directory of AI models. Compare state-of-the-art models by benchmarks, features, providers, and pricing, and find the best AI model for your use case with AI Stats.",
	keywords: [
		"AI models",
		"machine learning models",
		"AI benchmarks",
		"compare AI models",
		"AI model pricing",
		"AI providers",
		"state-of-the-art models",
		"AI Stats",
	],
	alternates: {
		canonical: "/models",
	},
};

type ModelsPageProps = {
	searchParams: Promise<SearchParams>;
};

function getModelYear(model: ModelCard): number | null {
	const groupKey = model.primary_group_key;
	if (!groupKey) return null;
	const [yearStr] = groupKey.split("-");
	const year = Number(yearStr);
	return Number.isNaN(year) ? null : year;
}

function filterAndSortModels(models: ModelCard[], query: string): ModelCard[] {
	let filtered = models;

	const trimmedQuery = query.trim();
	if (trimmedQuery) {
		const q = trimmedQuery.toLowerCase();
		filtered = filtered.filter((m: ModelCard) => {
			const name = m.name.toLowerCase();
			const organisation = m.organisation_name
				? m.organisation_name.toLowerCase()
				: "";

			return name.includes(q) || organisation.includes(q);
		});
	}

	const compareByTimestamp = (m: ModelCard) => m.primary_timestamp ?? 0;

	return [...filtered].sort((a: ModelCard, b: ModelCard) => {
		const orgA = a.organisation_name ?? "";
		const orgB = b.organisation_name ?? "";
		const organisationCompare = orgA.localeCompare(orgB);
		if (organisationCompare !== 0) return organisationCompare;
		return compareByTimestamp(b) - compareByTimestamp(a);
	});
}

function isRumoured(status?: string | null): boolean {
	return status?.toLowerCase() === "rumoured";
}

function getYearPagination(
	models: ModelCard[],
	yearParam: number,
): {
	years: number[];
	activeYear: number | null;
	paginatedModels: ModelCard[];
	hasUpcoming: boolean;
	hasUnknown: boolean;
} {
	const yearSet = new Set<number>();
	for (const model of models) {
		const year = getModelYear(model);
		if (year !== null) {
			yearSet.add(year);
		}
	}

	const upcomingModels = models.filter((model) => isRumoured(model.status));
	const unknownModels = models.filter(
		(model) => !model.release_date && !isRumoured(model.status),
	);
	const hasUpcoming = upcomingModels.length > 0;
	const hasUnknown = unknownModels.length > 0;

	const years = Array.from(yearSet).sort((a, b) => b - a);
	const defaultYear: number | null = years.length > 0 ? years[0] : null;

	let activeYear: number | null = defaultYear;
	if (yearParam === UPCOMING_TAB_VALUE && hasUpcoming) {
		activeYear = UPCOMING_TAB_VALUE;
	} else if (yearParam === UNKNOWN_TAB_VALUE && hasUnknown) {
		activeYear = UNKNOWN_TAB_VALUE;
	} else if (yearParam && years.includes(yearParam)) {
		activeYear = yearParam;
	}

	const paginatedModels =
		activeYear === UPCOMING_TAB_VALUE
			? upcomingModels
			: activeYear === UNKNOWN_TAB_VALUE
				? unknownModels
				: activeYear === null
					? models
					: models.filter(
							(model) => getModelYear(model) === activeYear,
						);

	return {
		years,
		activeYear,
		paginatedModels,
		hasUpcoming,
		hasUnknown,
	};
}

async function ModelsPageContent({ searchParams }: ModelsPageProps) {
	const { q, year } = await loadModelsSearchParams(searchParams);
	const includeHidden = false;
	const filteredModelsFromDb = await getModelsFiltered({ search: q, includeHidden });
	const filteredModels = filterAndSortModels(filteredModelsFromDb, q);
	const { years, activeYear, paginatedModels, hasUpcoming, hasUnknown } = getYearPagination(
		filteredModels,
		year ?? 0,
	);

	return (
		<ModelsDisplay
			models={paginatedModels}
			years={years}
			activeYear={activeYear}
			hasUpcoming={hasUpcoming}
			hasUnknown={hasUnknown}
		/>
	);
}

function ModelsGridSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<div className="h-6 w-32 rounded bg-muted animate-pulse" />
				<div className="h-8 w-full md:w-1/5 rounded-full bg-muted animate-pulse" />
			</div>
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{Array.from({ length: 16 }).map((_, index) => (
					<div
						key={index}
						className="h-32 rounded-xl bg-muted animate-pulse"
					/>
				))}
			</div>
		</div>
	);
}

export default function ModelsPage({ searchParams }: ModelsPageProps) {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<ModelsGridSkeleton />}>
					<ModelsPageContent searchParams={searchParams} />
				</Suspense>
			</div>
		</main>
	);
}
