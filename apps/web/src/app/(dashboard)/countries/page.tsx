import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { cacheLife } from "next/cache";

import CountriesGrid from "@/components/(data)/countries/CountryGrid";
import { getCountrySummariesCached } from "@/lib/fetchers/countries/getCountrySummaries";

export const metadata: Metadata = {
	title: "AI Models By Country - Global Model Landscape",
	description:
		"Explore AI organisations and their models grouped by country. See where AI development is concentrated globally and how different regions contribute to the evolving model ecosystem.",
	keywords: [
		"AI countries",
		"AI organisations by country",
		"AI model geography",
		"AI hubs",
		"global AI landscape",
		"AI Stats",
	],
	alternates: {
		canonical: "/countries",
	},
};

export default async function CountriesPage() {
	"use cache";
	cacheLife({
		stale: 60 * 60 * 24 * 7,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 365,
	});

	const includeHidden = false;
	const countries = await getCountrySummariesCached(includeHidden);

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8 space-y-6">
				<header className="space-y-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<h1 className="font-bold text-xl mb-2 md:mb-0">
							Countries
						</h1>
					</div>
				</header>

				<CountriesGrid countries={countries} />
			</div>
		</main>
	);
}
