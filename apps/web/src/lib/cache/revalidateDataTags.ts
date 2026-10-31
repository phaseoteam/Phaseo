// The website has no server-side data cache to expire: pages read the web API
// on every request and freshness comes from the web API's own caching, which
// admin tools purge directly. These helpers are kept as no-ops so admin
// actions keep their call sites; new code should not call them.

type RevalidateModelDataTagOptions = {
	modelId?: string | null;
	organisationIds?: Array<string | null | undefined>;
	benchmarkIds?: Array<string | null | undefined>;
};

type RevalidateBenchmarkTagOptions = {
	benchmarkId?: string | null;
	benchmarkIds?: Array<string | null | undefined>;
	modelId?: string | null;
};

type RevalidateProviderTagOptions = {
	providerId?: string | null;
	providerIds?: Array<string | null | undefined>;
};

type RevalidateOrganisationTagOptions = {
	organisationId?: string | null;
	organisationIds?: Array<string | null | undefined>;
};

export function expirePublicModelCatalogueCache(_options: RevalidateModelDataTagOptions = {}) {}

export function revalidateModelDataOnlyTags(_options: RevalidateModelDataTagOptions = {}) {}

export function revalidateModelApiInfoTags(_options: RevalidateModelDataTagOptions = {}) {}

export function revalidateModelDataTags(_options: RevalidateModelDataTagOptions = {}) {}

export function revalidateBenchmarkDataTags(_options: RevalidateBenchmarkTagOptions = {}) {}

export function revalidateProviderDataTags(_options: RevalidateProviderTagOptions = {}) {}

export function revalidateOrganisationDataTags(_options: RevalidateOrganisationTagOptions = {}) {}

export function revalidateAppDataTags(_appIds: string[] = []) {}
