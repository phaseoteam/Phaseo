import type { Metadata } from "next";
import Link from "next/link";

import CountryDetailShell from "@/components/(data)/countries/CountryDetailShell";
import CountryOrganisationCard from "@/components/(data)/countries/CountryOrganisationCard";
import CountryModelsSection from "@/components/(data)/countries/CountryModelsSection";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Logo } from "@/components/Logo";
import {
	getUniqueCountryModels,
	normaliseIso,
	formatCountryDate,
} from "@/components/(data)/countries/utils";
import { fetchFrontendCountry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";

async function loadCountry(isoInput: string) {
	const iso = normaliseIso(isoInput);
	return fetchFrontendCountry(iso).catch(() => null);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ iso: string }>;
}): Promise<Metadata> {
	const { iso: isoParamRaw } = await params;
	const isoParam = normaliseIso(isoParamRaw);
	const country = await loadCountry(isoParam);
	const pathIso = isoParam.toLowerCase();
	const path = `/countries/${pathIso}`;
	const imagePath = `/og/countries/${pathIso}`;

	if (!country) {
		return buildMetadata({
			title: `${isoParam || "Unknown"} - AI Country View`,
			description:
				"This country view is still filling in. As Phaseo expands coverage, this page will include local organisations, model catalogues, provider footprints, and release activity trends.",
			path,
			keywords: [
				"Phaseo",
				"countries",
				"AI country view",
				"AI organisations",
			],
			imagePath,
		});
	}

	const countryName = country.countryName;

	return buildMetadata({
		title: `${countryName} AI Models`,
		description: `Explore AI organisations and models tracked in ${countryName} on Phaseo. See which providers and model families originate from this country and how its AI ecosystem is evolving.`,
		path,
		keywords: [
			"Phaseo",
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
	const { iso: isoParamRaw } = await params;
	const iso = normaliseIso(isoParamRaw);
	const country = await loadCountry(iso);

	if (!country) {
		notFound();
		return (
			<CountryDetailShell iso={iso} country={undefined}>
				<div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
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
		<CountryDetailShell iso={iso} country={country} tocItems={[{ id: "overview", label: "Overview" }, { id: "latest-releases", label: "Latest Releases" }, { id: "organisations", label: "Organisations" }, { id: "models", label: "Models" }]}>
			<div className="space-y-10">
				<section
					id="overview"
					className="scroll-mt-36 grid overflow-hidden border-y border-border/70 md:grid-cols-3 md:divide-x md:divide-border/70"
				>
					<div className="flex flex-col border-b border-border/70 px-4 py-5 md:border-b-0">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold text-muted-foreground">
								Active organisations
							</p>
						</div>
						<p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
							{country.totalOrganisations}
						</p>
					</div>
					<div className="flex flex-col border-b border-border/70 px-4 py-5 md:border-b-0">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold text-muted-foreground">
								Models tracked
							</p>
						</div>
						<p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
							{country.totalModels}
						</p>
					</div>
					<div className="px-4 py-5">
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
										<div
											className="relative flex size-10 items-center justify-center rounded-md border border-border/70 bg-background"
											style={{ borderColor: latestAccent }}
										>
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
											<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
												{latestModel.name}
											</span>
										</Link>
										{latestModel.organisation_id && (
											<Link
												href={`/organisations/${latestModel.organisation_id}`}
												className="text-sm font-medium text-muted-foreground hover:text-foreground"
											>
												<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
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
				</section>

				<section id="latest-releases" className="scroll-mt-36 space-y-4">
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
									<h3 className="text-sm font-medium text-muted-foreground">
										{label}
									</h3>
									<div className="divide-y divide-border/70">
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

				<section id="organisations" className="scroll-mt-36 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
							Organisations From {country.countryName}
						</h2>
					</div>
					{organisationEntries.length ? (
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

				<section id="models" className="scroll-mt-36 space-y-4 border-t border-border pt-10">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
							Models From {country.countryName}
						</h2>
						<p className="text-sm text-muted-foreground">
							Browse the complete catalogue, grouped by organisation.
						</p>
					</div>
					<CountryModelsSection models={models} />
				</section>
			</div>
		</CountryDetailShell>
	);
}
