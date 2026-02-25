import { Suspense } from "react";
import ModelsDisplay from "@/components/(data)/models/Models/ModelsDisplay";
import {
	getModelsFilteredCached,
} from "@/lib/fetchers/models/getAllModels";
import { loadModelsSearchParams } from "./search-params";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

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

function filterAndSortModels(
	models: Awaited<ReturnType<typeof getModelsFilteredCached>>,
	query: string
) {
	let filtered = models;

	const trimmedQuery = query.trim();
	if (trimmedQuery) {
		const q = trimmedQuery.toLowerCase();
		filtered = filtered.filter((m) => {
			const name = m.name.toLowerCase();
			const organisation = m.organisation_name
				? m.organisation_name.toLowerCase()
				: "";

			return name.includes(q) || organisation.includes(q);
		});
	}

	const compareByTimestamp = (m: (typeof filtered)[number]) =>
		m.primary_timestamp ?? 0;

	return [...filtered].sort((a, b) => {
		const orgA = a.organisation_name ?? "";
		const orgB = b.organisation_name ?? "";
		const organisationCompare = orgA.localeCompare(orgB);
		if (organisationCompare !== 0) return organisationCompare;
		return compareByTimestamp(b) - compareByTimestamp(a);
	});
}

async function ModelsPageContent({ searchParams }: ModelsPageProps) {
	const { q } = await loadModelsSearchParams(searchParams);
	const includeHidden = false;
	const filteredModelsFromDb = await getModelsFilteredCached({
		search: q,
		includeHidden,
	});
	const filteredModels = filterAndSortModels(filteredModelsFromDb, q);

	return <ModelsDisplay models={filteredModels} />;
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
