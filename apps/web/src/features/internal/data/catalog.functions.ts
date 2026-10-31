// Admin catalogue editor data (fetchAdminCatalog*). The data layout gates the
// area in its route beforeLoad; each server function re-checks admin access
// itself so the records never reach a visitor who skipped that gate.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

type CatalogListResource = "models" | "organisations" | "providers" | "benchmarks";
type CatalogRecordResource = "organisation" | "provider" | "benchmark" | "model";
type CatalogListArgs = { q?: string; page?: number; pageSize?: number; attention?: string };

async function adminCatalog() {
	const [{ requireInternalAdmin }, catalog] = await Promise.all([
		import("@/lib/auth/requireInternalAdmin"),
		import("@/lib/fetchers/internal/fetchAdminCatalog"),
	]);
	await requireInternalAdmin("/internal");
	return catalog;
}

const getAdminCatalogHome = createServerFn({ method: "GET" }).handler(async () => {
	const catalog = await adminCatalog();
	const [counts, overview] = await Promise.all([catalog.fetchAdminCatalogCounts(), catalog.fetchAdminCatalogOverview()]);
	return { counts, overview };
});

export const adminCatalogHomeQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "catalog", "home"],
		queryFn: () => getAdminCatalogHome(),
	});

const getAdminCatalogList = createServerFn({ method: "GET" })
	.validator((input: { resource: CatalogListResource; args: CatalogListArgs }) => input)
	.handler(async ({ data: { resource, args } }) => {
		const catalog = await adminCatalog();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- list rows are untyped
		return (await catalog.fetchAdminCatalogList(resource, args)) as { rows: any[]; count: number };
	});

export const adminCatalogListQuery = (resource: CatalogListResource, args: CatalogListArgs) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "catalog", "list", resource, args],
		queryFn: () => getAdminCatalogList({ data: { resource, args } }),
	});

const getAdminCatalogRecord = createServerFn({ method: "GET" })
	.validator((input: { resource: CatalogRecordResource; id: string }) => input)
	.handler(async ({ data: { resource, id } }) => {
		const catalog = await adminCatalog();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- records are untyped
		return (await catalog.fetchAdminCatalogRecord(resource, id)) as { row: any | null; links?: any[] };
	});

export const adminCatalogRecordQuery = (resource: CatalogRecordResource, id: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "catalog", "record", resource, id],
		queryFn: () => getAdminCatalogRecord({ data: { resource, id } }),
	});

const getAdminModelFormOptions = createServerFn({ method: "GET" }).handler(async () => {
	const catalog = await adminCatalog();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- option rows are untyped
	return (await catalog.fetchAdminModelFormOptions()) as { organisations: any[]; providers: any[]; families: any[]; benchmarks: any[]; previousModels: any[]; subscriptionPlans: any[] };
});

export const adminModelFormOptionsQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "catalog", "model-form-options"],
		queryFn: () => getAdminModelFormOptions(),
	});

const getAdminProviderFormOptions = createServerFn({ method: "GET" }).handler(async () => {
	const catalog = await adminCatalog();
	return catalog.fetchAdminProviderFormOptions();
});

export const adminProviderFormOptionsQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "internal", "catalog", "provider-form-options"],
		queryFn: () => getAdminProviderFormOptions(),
	});
