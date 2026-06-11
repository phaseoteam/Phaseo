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
	getCountrySummariesCached,
	type CountrySummary,
} from "@/lib/fetchers/countries/getCountrySummaries";
import {
	getAllModelsCached,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import {
	getAllOrganisationsCached,
	type OrganisationCard,
} from "@/lib/fetchers/organisations/getAllOrganisations";
import {
	getAllSubscriptionPlansCached,
	type SubscriptionPlanSummary,
} from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";

export interface SearchableModel {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
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
	m: SearchLogoTuple[];
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

function transformModels(models: ModelCard[]): SearchableModel[] {
	return models.map((model) => ({
		id: model.model_id,
		title: model.name,
		subtitle: model.organisation_name,
		href: `/models/${model.model_id}`,
		logoId: model.organisation_id,
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
	return providers.map((provider) => ({
		id: provider.api_provider_id,
		title: provider.api_provider_name,
		subtitle: null,
		href: `/api-providers/${provider.api_provider_id}`,
		logoId: provider.api_provider_id,
	}));
}

function transformSubscriptionPlans(
	plans: SubscriptionPlanSummary[],
): SearchableSubscriptionPlan[] {
	return plans.flatMap((plan) => {
		const organisationName = plan.organisation?.name ?? "";
		return plan.prices.map((price) => {
			const frequencyLabel = price.frequency
				? price.frequency.charAt(0).toUpperCase() + price.frequency.slice(1)
				: "";
			const subtitle = frequencyLabel
				? `${organisationName} - ${frequencyLabel}`.trim()
				: organisationName || null;

			return {
				id: price.plan_uuid,
				title: plan.name,
				subtitle,
				href: `/subscription-plans/${plan.plan_id}`,
				logoId: plan.organisation_id,
			};
		});
	});
}

function transformCountries(countries: CountrySummary[]): SearchableCountry[] {
	return countries.slice(0, 20).map((country) => ({
		id: country.iso.toLowerCase(),
		title: country.countryName,
		subtitle: `${country.totalModels} models`,
		href: `/countries/${country.iso.toLowerCase()}`,
		flagIso: country.iso.toLowerCase(),
	}));
}

export async function getSearchData(includeHidden: boolean): Promise<SearchData> {
	const [
		models,
		organisations,
		benchmarks,
		apiProviders,
		subscriptionPlans,
		countrySummaries,
	] = await Promise.all([
		getAllModelsCached(includeHidden),
		getAllOrganisationsCached(),
		getAllBenchmarksCached(),
		getAllAPIProvidersCached(),
		getAllSubscriptionPlansCached(),
		getCountrySummariesCached(includeHidden),
	]);

	return {
		models: transformModels(models),
		organisations: transformOrganisations(organisations),
		benchmarks: transformBenchmarks(benchmarks),
		apiProviders: transformAPIProviders(apiProviders),
		subscriptionPlans: transformSubscriptionPlans(subscriptionPlans),
		countries: transformCountries(countrySummaries),
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
	cacheTag("data:subscription_plans");
	cacheTag("frontend:subscription-plans");

	console.log("[fetch] HIT DB for search data");
	return getSearchData(includeHidden);
}
