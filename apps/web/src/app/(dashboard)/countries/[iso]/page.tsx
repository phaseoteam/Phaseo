import type { Metadata } from "next";
import Link from "next/link";

import CountryDetailShell from "@/components/(data)/countries/CountryDetailShell";
import CountryOrganisationCard from "@/components/(data)/countries/CountryOrganisationCard";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Logo } from "@/components/Logo";
import { formatCountryDate } from "@/components/(data)/countries/utils";
import {
	getCountrySummaryByIso,
	getUniqueCountryModels,
	normaliseIso,
} from "@/lib/fetchers/countries/getCountrySummary";
import { buildMetadata } from "@/lib/seo";
import { cacheLife } from "next/cache";

async function loadCountry(isoInput: string, includeHidden: boolean) {
	const iso = normaliseIso(isoInput);
	return getCountrySummaryByIso(iso, includeHidden);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ iso: string }>;
}): Promise<Metadata> {
	const { iso: isoParamRaw } = await params;
	const isoParam = normaliseIso(isoParamRaw);
	const includeHidden = false;
	const country = await loadCountry(isoParam, includeHidden);
	const pathIso = isoParam.toLowerCase();
	const path = `/countries/${pathIso}`;
	const imagePath = `/og/countries/${pathIso}`;

	if (!country) {
		return buildMetadata({
			title: `${isoParam || "Unknown"} - AI Country View`,
			description:
				"This experimental view does not yet have detailed data for this country. We are continuously adding more locations to AI Stats.",
			path,
			keywords: [
				"AI Stats",
				"countries",
				"AI country view",
				"AI organisations",
			],
			imagePath,
		});
	}

	const countryName = country.countryName;

	return buildMetadata({
		title: `${countryName} - AI Organisations & Models`,
		description: `Explore AI organisations and models tracked in ${countryName} on AI Stats. See which providers and model families originate from this country and how its AI ecosystem is evolving.`,
		path,
		keywords: [
			"AI Stats",
			"countries",
			countryName,
			`AI in ${countryName}`,
			"AI organisations",
			"AI models",
		],
		imagePath,
	});
}

export default async function CountryDetailPage({
	params,
}: {
	params: Promise<{ iso: string }>;
}) {
	"use cache";
	cacheLife({
		stale: 60 * 60 * 24 * 7,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 365,
	});

	const { iso: isoParamRaw } = await params;
	const iso = normaliseIso(isoParamRaw);
	const includeHidden = false;
	const country = await loadCountry(iso, includeHidden);

	if (!country) {
		return (
			<CountryDetailShell iso={iso} country={undefined}>
				<div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-muted-foreground dark:border-zinc-700 dark:bg-zinc-900/70">
					We do not yet have organisations or models mapped to this
					country. Check back soon as we expand coverage.
				</div>
			</CountryDetailShell>
		);
	}

	const organisationEntries = country.organisations;
	const models = getUniqueCountryModels(country);
	const modelsToShow = models.slice(1, 10);
	const latestModel = country.latestModel;
	const latestAccent = latestModel?.organisation_colour ?? "hsl(222 89% 53%)";

	return (
		<CountryDetailShell iso={iso} country={country}>
			<div className="space-y-10">
				<div className="grid gap-4 md:grid-cols-3">
					<div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold text-muted-foreground">
								Active organisations
							</p>
						</div>
						<p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
							{country.totalOrganisations}
						</p>
					</div>
					<div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold text-muted-foreground">
								Models tracked
							</p>
						</div>
						<p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
							{country.totalModels}
						</p>
					</div>
					<div
						className="rounded-2xl border-2 bg-white p-5 shadow-sm backdrop-blur dark:bg-zinc-900/80"
						style={{
							borderColor: latestAccent,
						}}
					>
						<div className="flex items-center justify-between">
							<p
								className="text-sm font-semibold"
								style={{ color: latestAccent }}
							>
								Latest model
							</p>
							{latestModel?.primary_date ? (
								<p className="text-xs text-muted-foreground">
									{formatCountryDate(latestModel.primary_date)}
								</p>
							) : null}
						</div>
						{latestModel ? (
							<div className="mt-3">
								<div className="flex items-center gap-3">
									<Link
										href={`/organisations/${latestModel.organisation_id}`}
									>
										<div className="relative flex h-10 w-10 items-center justify-center rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
											<Logo
												id={latestModel.organisation_id}
												alt={
													latestModel.organisation_name ??
													"Organisation logo"
												}
												className="object-contain"
												width={30}
												height={30}
											/>
										</div>
									</Link>
									<div className="flex flex-col">
										<Link
											href={`/models/${latestModel.model_id}`}
											className="text-lg font-semibold leading-tight text-[inherit]"
										>
											<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
												{latestModel.name}
											</span>
										</Link>
										{latestModel.organisation_id && (
											<Link
												href={`/organisations/${latestModel.organisation_id}`}
												className="text-sm font-medium text-muted-foreground hover:text-foreground"
											>
												<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
													{latestModel.organisation_name ??
														"Unknown organisation"}
												</span>
											</Link>
										)}
									</div>
								</div>
							</div>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								No latest model tracked yet.
							</p>
						)}
					</div>
				</div>

				<section className="space-y-4">
					<h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
						Latest releases from {country.countryName}
					</h2>
					{modelsToShow.length ? (
						<div className="space-y-4">
							{Array.from(
								modelsToShow.reduce((map, model) => {
									const label = formatCountryDate(
										model.primary_date
									);
									if (!map.has(label)) map.set(label, []);
									map.get(label)!.push(model);
									return map;
								}, new Map<string, typeof modelsToShow>())
							).map(([label, groupedModels]) => (
								<div key={label} className="space-y-2">
									<h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
										{label}
									</h3>
									<div className="grid gap-4 md:grid-cols-3">
										{groupedModels.map((model) => (
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
						<p className="text-sm text-muted-foreground">
							No models have been mapped to {country.countryName}{" "}
							yet.
						</p>
					)}
				</section>

				<section className="space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
							Organisations From {country.countryName}
						</h2>
					</div>
					{organisationEntries.length ? (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{organisationEntries.map((organisation) => (
								<CountryOrganisationCard
									key={organisation.organisation_id}
									organisation={organisation}
								/>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No organisations have been mapped to{" "}
							{country.countryName} yet.
						</p>
					)}
				</section>
			</div>
		</CountryDetailShell>
	);
}
