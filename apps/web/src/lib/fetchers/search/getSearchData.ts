// lib/fetchers/search/getSearchData.ts
import { cacheLife, cacheTag } from "next/cache";
import {
	getAllAPIProvidersCached,
	type APIProviderCard,
} from "@/lib/fetchers/api-providers/getAllAPIProviders";
import {
	getAllBenchmarksCached,
	type BenchmarkCard,
} from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import {
	getModelsFilteredCached,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import {
	getAllOrganisationsCached,
	type OrganisationCard,
} from "@/lib/fetchers/organisations/getAllOrganisations";

export interface SearchableModel {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
	releaseGroupLabel: string | null;
}

export interface SearchableOrganisation {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
}

export interface SearchableBenchmark {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
}

export interface SearchableAPIProvider {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
}

export interface SearchableSubscriptionPlan {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string | null;
}

export interface SearchableCountry {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	flagIso: string;
}

export interface SearchData {
	models: SearchableModel[];
	organisations: SearchableOrganisation[];
	benchmarks: SearchableBenchmark[];
	apiProviders: SearchableAPIProvider[];
	subscriptionPlans: SearchableSubscriptionPlan[];
	countries: SearchableCountry[];
}

type SearchModelTuple = [string, string, string | null, string, string, string | null];
type SearchLogoTuple = [string, string, string | null, string, string];
type SearchBenchmarkTuple = [string, string, string | null, string];
type SearchNullableLogoTuple = [
	string,
	string,
	string | null,
	string,
	string | null,
];
type SearchCountryTuple = [string, string, string | null, string, string];

export interface CompactSearchData {
	m: SearchModelTuple[];
	o: SearchLogoTuple[];
	b: SearchBenchmarkTuple[];
	p: SearchLogoTuple[];
	s: SearchNullableLogoTuple[];
	c: SearchCountryTuple[];
}

export function compactSearchData(data: SearchData): CompactSearchData {
	return {
		m: data.models.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
			item.logoId,
			item.releaseGroupLabel,
		]),
		o: data.organisations.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
			item.logoId,
		]),
		b: data.benchmarks.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
		]),
		p: data.apiProviders.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
			item.logoId,
		]),
		s: data.subscriptionPlans.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
			item.logoId,
		]),
		c: data.countries.map((item) => [
			item.id,
			item.title,
			item.subtitle,
			item.href,
			item.flagIso,
		]),
	};
}

function formatMonthGroup(value: string | null | undefined): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;

	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	return `${monthNames[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

function transformModels(models: ModelCard[]): SearchableModel[] {
	return [...models]
		.sort((left, right) => {
			const rightTime = right.primary_timestamp ?? Number.NEGATIVE_INFINITY;
			const leftTime = left.primary_timestamp ?? Number.NEGATIVE_INFINITY;
			if (rightTime !== leftTime) return rightTime - leftTime;
			return left.name.localeCompare(right.name);
		})
		.map((model) => ({
			id: model.model_id,
			title: model.name,
			subtitle: model.organisation_name,
			href: `/models/${model.model_id}`,
			logoId: model.organisation_id,
			releaseGroupLabel: formatMonthGroup(model.primary_date),
		}));
}

function transformOrganisations(
	organisations: OrganisationCard[],
): SearchableOrganisation[] {
	return organisations.map((org) => ({
		id: org.organisation_id,
		title: org.organisation_name || org.organisation_id,
		subtitle: null,
		href: `/organisations/${org.organisation_id}`,
		logoId: org.organisation_id,
	}));
}

function transformBenchmarks(benchmarks: BenchmarkCard[]): SearchableBenchmark[] {
	return benchmarks.map((benchmark) => ({
		id: benchmark.benchmark_id,
		title: benchmark.benchmark_name,
		subtitle: `${benchmark.total_models} models`,
		href: `/benchmarks/${benchmark.benchmark_id}`,
	}));
}

function transformAPIProviders(
	providers: APIProviderCard[],
): SearchableAPIProvider[] {
	return [...providers]
		.sort((left, right) => {
			return left.api_provider_name.localeCompare(right.api_provider_name);
		})
		.map((provider) => ({
			id: provider.api_provider_id,
			title: provider.api_provider_name,
			subtitle: `${provider.active_models.toLocaleString()} active models`,
			href: `/api-providers/${provider.api_provider_id}`,
			logoId: provider.api_provider_id,
		}));
}

export async function getSearchData(includeHidden: boolean): Promise<SearchData> {
	const [
		models,
		organisations,
		benchmarks,
		apiProviders,
	] = await Promise.all([
		getModelsFilteredCached({ includeHidden }),
		getAllOrganisationsCached(),
		getAllBenchmarksCached(),
		getAllAPIProvidersCached(),
	]);

	return {
		models: transformModels(models),
		organisations: transformOrganisations(organisations),
		benchmarks: transformBenchmarks(benchmarks),
		apiProviders: transformAPIProviders(apiProviders),
		subscriptionPlans: [],
		countries: [],
	};
}

export async function getSearchDataCached(
	includeHidden: boolean,
): Promise<SearchData> {
	"use cache";

	cacheLife("days");
	cacheTag("search:data");
	cacheTag("data:models");
	cacheTag("data:organisations");
	cacheTag("data:benchmarks");
	cacheTag("data:api_providers");

	console.log("[fetch] HIT DB for search data");
	return getSearchData(includeHidden);
}
