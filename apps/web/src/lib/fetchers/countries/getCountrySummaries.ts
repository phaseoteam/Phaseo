import { cacheLife, cacheTag } from "next/cache";

import {
	getAllModelsCached,
	ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import {
	getAllOrganisationsCached,
} from "@/lib/fetchers/organisations/getAllOrganisations";
import { formatCountryName } from "@/lib/fetchers/countries/utils";

const MAX_RECENT_MODELS_PER_COUNTRY = 4;

interface CountryOrganisationBuilder {
	organisation_id: string;
	organisation_name: string | null;
	colour: string | null;
	models: ModelCard[];
}

interface CountryBuilder {
	iso: string;
	countryName: string;
	organisations: Map<string, CountryOrganisationBuilder>;
	recentModels: ModelCard[];
}

export interface CountryOrganisationSummary {
	organisation_id: string;
	organisation_name: string | null;
	colour: string | null;
	models: ModelCard[];
	modelCount: number;
	latestModel: ModelCard | null;
}

export interface CountrySummary {
	iso: string;
	countryName: string;
	totalOrganisations: number;
	totalModels: number;
	recentModels: ModelCard[];
	latestModel: ModelCard | null;
	organisations: CountryOrganisationSummary[];
}

function createCountryBuilder(iso: string): CountryBuilder {
	return {
		iso,
		countryName: formatCountryName(iso),
		organisations: new Map(),
		recentModels: [],
	};
}

export async function getCountrySummaries(
	includeHidden: boolean
): Promise<CountrySummary[]> {
	const [organisations, models] = await Promise.all([
		getAllOrganisationsCached(),
		getAllModelsCached(includeHidden),
	]);

	const countryBuilders = new Map<string, CountryBuilder>();
	const organisationToCountry = new Map<
		string,
		{ iso: string; builder: CountryBuilder }
	>();

	for (const organisation of organisations) {
		if (!organisation.organisation_id) continue;

		const iso = (organisation.country_code ?? "")
			.trim()
			.toUpperCase();

		if (!iso) continue;

		if (!countryBuilders.has(iso)) {
			countryBuilders.set(iso, createCountryBuilder(iso));
		}

		const builder = countryBuilders.get(iso)!;

		const orgSummary: CountryOrganisationBuilder = {
			organisation_id: organisation.organisation_id,
			organisation_name: organisation.organisation_name ?? null,
			colour: organisation.colour ?? null,
			models: [],
		};

		builder.organisations.set(organisation.organisation_id, orgSummary);
		organisationToCountry.set(organisation.organisation_id, {
			iso,
			builder,
		});
	}

	for (const model of models) {
		if (!model.organisation_id) continue;
		const mapping = organisationToCountry.get(model.organisation_id);
		if (!mapping) continue;

		const { builder } = mapping;
		const orgSummary = builder.organisations.get(model.organisation_id);
		if (!orgSummary) continue;

		orgSummary.models.push(model);
		builder.recentModels.push(model);
	}

	const summaries = Array.from(countryBuilders.values())
		.map((builder) => {
			const organisations = Array.from(
				builder.organisations.values()
			).map((org) => {
				const sortedModels = [...org.models].sort(
					(a, b) =>
						(b.primary_timestamp ?? 0) -
						(a.primary_timestamp ?? 0)
				);

				return {
					...org,
					models: sortedModels,
					modelCount: sortedModels.length,
					latestModel: sortedModels[0] ?? null,
				};
			});

			const sortedOrganisations = [...organisations].sort((a, b) => {
				if (b.modelCount !== a.modelCount) {
					return b.modelCount - a.modelCount;
				}
				const aTimestamp = a.latestModel?.primary_timestamp ?? 0;
				const bTimestamp = b.latestModel?.primary_timestamp ?? 0;
				return bTimestamp - aTimestamp;
			});

			const sortedRecentModels = [...builder.recentModels].sort(
				(a, b) =>
					(b.primary_timestamp ?? 0) -
					(a.primary_timestamp ?? 0)
			);

			return {
				iso: builder.iso,
				countryName: builder.countryName,
				totalOrganisations: sortedOrganisations.length,
				totalModels: sortedOrganisations.reduce(
					(sum, org) => sum + org.modelCount,
					0
				),
				recentModels: sortedRecentModels.slice(
					0,
					MAX_RECENT_MODELS_PER_COUNTRY
				),
				latestModel: sortedRecentModels[0] ?? null,
				organisations: sortedOrganisations,
			};
		})
		.sort((a, b) => b.totalModels - a.totalModels);

	return summaries;
}

export async function getCountrySummariesCached(
	includeHidden: boolean
): Promise<CountrySummary[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:organisations");
	cacheTag("data:models");

	console.log("[fetch] HIT DB for country summaries");
	return getCountrySummaries(includeHidden);
}
