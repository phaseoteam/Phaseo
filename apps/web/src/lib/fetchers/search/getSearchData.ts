// lib/fetchers/search/getSearchData.ts
import { cacheLife, cacheTag } from "next/cache";
import { getAllModelsCached, ModelCard } from "@/lib/fetchers/models/getAllModels";
import { getAllOrganisationsCached, OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import { getAllBenchmarksCached, BenchmarkCard } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import { getAllAPIProvidersCached, APIProviderCard } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { getCountrySummariesCached, CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";
import { createClient } from "@/utils/supabase/client";

// Searchable entity interfaces
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
type SearchNullableLogoTuple = [string, string, string | null, string, string | null];
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

// Transform functions
function transformModels(models: ModelCard[]): SearchableModel[] {
    return models.map(model => ({
        id: model.model_id,
        title: model.name,
        subtitle: model.organisation_name,
        href: `/models/${model.model_id}`,
        logoId: model.organisation_id,
    }));
}

function transformOrganisations(organisations: OrganisationCard[]): SearchableOrganisation[] {
    return organisations.map(org => ({
        id: org.organisation_id,
        title: org.organisation_name || org.organisation_id,
        subtitle: null,
        href: `/organisations/${org.organisation_id}`,
        logoId: org.organisation_id,
    }));
}

function transformBenchmarks(benchmarks: BenchmarkCard[]): SearchableBenchmark[] {
    return benchmarks.map(benchmark => ({
        id: benchmark.benchmark_id,
        title: benchmark.benchmark_name,
        subtitle: `${benchmark.total_models} models`,
        href: `/benchmarks/${benchmark.benchmark_id}`,
    }));
}

function transformAPIProviders(providers: APIProviderCard[]): SearchableAPIProvider[] {
    return providers.map(provider => ({
        id: provider.api_provider_id,
        title: provider.api_provider_name,
        subtitle: null,
        href: `/api-providers/${provider.api_provider_id}`,
        logoId: provider.api_provider_id,
    }));
}

async function transformSubscriptionPlans(): Promise<SearchableSubscriptionPlan[]> {
    const supabase = await createClient();
    const pageSize = 1000;
    const rows: any[] = [];

    for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from("data_subscription_plans")
            .select(`
                plan_uuid,
                plan_id,
                name,
                frequency,
                price,
                currency,
                organisation_id,
                data_organisations!inner (
                    organisation_id,
                    name
                )
            `)
            .range(from, to);

        if (error) {
            console.warn("[getSearchData] Error fetching subscription plans:", error);
            return [];
        }

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        rows.push(...data);

        if (data.length < pageSize) {
            break;
        }
    }

    return rows.map((plan: any) => {
        // Format frequency for display (e.g., "monthly" -> "Monthly", "annual" -> "Annual")
        const frequencyLabel = plan.frequency
            ? plan.frequency.charAt(0).toUpperCase() + plan.frequency.slice(1)
            : '';

        // Create a more descriptive title or subtitle including frequency
        const subtitle = frequencyLabel
            ? `${plan.data_organisations?.name || ''} • ${frequencyLabel}`.trim()
            : plan.data_organisations?.name || null;

        return {
            id: plan.plan_uuid, // Use plan_uuid to ensure uniqueness across frequencies
            title: plan.name,
            subtitle,
            href: `/subscription-plans/${plan.plan_id}`,
            logoId: plan.organisation_id,
        };
    });
}

function transformCountries(countries: CountrySummary[]): SearchableCountry[] {
    // Top 20 countries by model count
    return countries.slice(0, 20).map(country => ({
        id: country.iso.toLowerCase(),
        title: country.countryName,
        subtitle: `${country.totalModels} models`,
        href: `/countries/${country.iso.toLowerCase()}`,
        flagIso: country.iso.toLowerCase(),
    }));
}

// Main export
export async function getSearchData(includeHidden: boolean): Promise<SearchData> {
    const [models, organisations, benchmarks, apiProviders, subscriptionPlans, countrySummaries] =
        await Promise.all([
            getAllModelsCached(includeHidden),
            getAllOrganisationsCached(),
            getAllBenchmarksCached(),
            getAllAPIProvidersCached(),
            transformSubscriptionPlans(),
            getCountrySummariesCached(includeHidden),
        ]);

    return {
        models: transformModels(models),
        organisations: transformOrganisations(organisations),
        benchmarks: transformBenchmarks(benchmarks),
        apiProviders: transformAPIProviders(apiProviders),
        subscriptionPlans: subscriptionPlans,
        countries: transformCountries(countrySummaries),
    };
}

export async function getSearchDataCached(
    includeHidden: boolean
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
