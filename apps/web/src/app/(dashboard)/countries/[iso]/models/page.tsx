import type { Metadata } from "next";

import CountryDetailShell from "@/components/(data)/countries/CountryDetailShell";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import {
	getCountrySummaryByIso,
	getUniqueCountryModels,
	normaliseIso,
} from "@/lib/fetchers/countries/getCountrySummary";
import { formatCountryDate } from "@/components/(data)/countries/utils";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ iso: string }>;
}): Promise<Metadata> {
	const { iso } = await params;
	const isoNormalized = normaliseIso(iso);
	const includeHidden = false;
	const country = await getCountrySummaryByIso(isoNormalized, includeHidden);
	const path = `/countries/${isoNormalized.toLowerCase()}/models`;
	const imagePath = `/og/countries/${isoNormalized.toLowerCase()}`;

	if (!country) {
		return buildMetadata({
			title: `${isoNormalized || "Unknown"} Models - Country Catalogue`,
			description:
				"Browse AI models by country. This location does not yet have tracked organisations or releases in AI Stats.",
			path,
			keywords: ["AI models", "countries", isoNormalized],
			imagePath,
		});
	}

	return buildMetadata({
		title: `${country.countryName} Models - Catalogue`,
		description: `See every model we have mapped to ${country.countryName}. Filter through the organisations based in this country and explore their releases.`,
		path,
		keywords: [country.countryName, "AI models", "AI Stats"],
		imagePath,
	});
}

export default async function CountryModelsPage({
	params,
}: {
	params: Promise<{ iso: string }>;
}) {
	const { iso } = await params;
	const isoNormalized = normaliseIso(iso);
	const includeHidden = false;
	const country = await getCountrySummaryByIso(isoNormalized, includeHidden);

	if (!country) {
		return (
			<CountryDetailShell iso={isoNormalized} country={undefined}>
				<div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-muted-foreground dark:border-zinc-700 dark:bg-zinc-900/70">
					We do not yet have model data for this country.
				</div>
			</CountryDetailShell>
		);
	}

	const models = getUniqueCountryModels(country);
	const grouped = Array.from(
		models.reduce((map, model) => {
			const label = formatCountryDate(model.primary_date);
			if (!map.has(label)) map.set(label, []);
			map.get(label)!.push(model);
			return map;
		}, new Map<string, typeof models>())
	);

	return (
		<CountryDetailShell iso={isoNormalized} country={country}>
			<div className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
							{models.length} models from {country.countryName}
						</h1>
					</div>
				</div>

				{models.length ? (
					<div className="space-y-4">
						{grouped.map(([label, group]) => (
							<div key={label} className="space-y-2">
								<h3 className="text-sm font-semibold uppercase text-muted-foreground">
									{label}
								</h3>
								<div className="grid gap-4 md:grid-cols-3">
									{group.map((model) => (
										<ModelCard
											key={model.model_id}
											model={model}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-muted-foreground dark:border-zinc-700 dark:bg-zinc-900/70">
						No models available yet.
					</div>
				)}
			</div>
		</CountryDetailShell>
	);
}
