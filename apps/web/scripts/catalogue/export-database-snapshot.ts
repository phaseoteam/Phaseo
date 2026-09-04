/* eslint-disable no-console -- scheduled export reports per-table progress */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { client } from "../importer/supa";

const PAGE_SIZE = 1_000;
const OUTPUT_DIR = resolve(process.cwd(), "../../packages/data/catalog/generated/database-v2");

const TABLES = {
	v2_labs: ["lab_slug"], v2_models: ["model_slug"], v2_model_families: ["family_slug"], v2_lab_links: ["lab_slug", "platform", "url"],
	v2_providers: ["provider_slug"], v2_provider_regions: ["provider_region_id"], v2_model_provider_routes: ["provider_model_id"],
	v2_route_capabilities: ["provider_model_id", "capability_id"], v2_service_tiers: ["service_tier_slug"], v2_route_variants: ["variant_id"],
	v2_meter_definitions: ["meter_key"], v2_pricing_skus: ["sku_id"], v2_pricing_sku_meters: ["sku_meter_id"],
	v2_benchmarks: ["benchmark_id"], v2_benchmark_results: ["result_id"], v2_model_aliases: ["alias_slug"],
	v2_model_links: ["model_slug", "link_kind", "url"], v2_model_details: ["model_slug", "detail_name"], v2_model_page_notices: ["model_slug"],
	v2_subscription_plans: ["plan_uuid"], v2_subscription_plan_models: ["plan_uuid", "model_slug"],
	v2_subscription_plan_features: ["plan_uuid", "feature_name"], v2_catalogue_source_overrides: ["source_type", "source_key"],
} as const;
type TableName = keyof typeof TABLES;

const OMITTED_FIELDS: Partial<Record<TableName, ReadonlySet<string>>> = {
	v2_catalogue_source_overrides: new Set(["actor_user_id"]),
};

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, stableValue(entry)]),
	);
}

function stableRowKey(row: Record<string, unknown>): string {
	return JSON.stringify(stableValue(row));
}

async function fetchTable(table: TableName, snapshotStartedAt: string): Promise<Record<string, unknown>[]> {
	const supabase = client();
	const rows: Record<string, unknown>[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		let query: any = supabase.from(table).select("*");
		for (const column of TABLES[table]) query = query.order(column, { ascending: true });
		if (!["v2_subscription_plan_models", "v2_subscription_plan_features"].includes(table)) query = query.lte("updated_at", snapshotStartedAt);
		const result = await query.range(from, from + PAGE_SIZE - 1);
		if (result.error) throw new Error(`Failed to export ${table}: ${result.error.message}`);
		const page = (result.data ?? []) as Record<string, unknown>[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	const omitted = OMITTED_FIELDS[table] ?? new Set<string>();
	return rows
		.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.has(key))))
		.map((row) => stableValue(row) as Record<string, unknown>)
		.sort((left, right) => stableRowKey(left).localeCompare(stableRowKey(right)));
}

async function main() {
	const snapshotStartedAt = new Date().toISOString();
	await rm(OUTPUT_DIR, { recursive: true, force: true });
	await mkdir(OUTPUT_DIR, { recursive: true });
	const stealthModelSlugs = new Set<string>();
	const stealthRouteIds = new Set<string>();
	const stealthSkuIds = new Set<string>();
	for (const table of Object.keys(TABLES) as TableName[]) {
		let rows = await fetchTable(table, snapshotStartedAt);
		for (const row of rows) {
			if (row.is_stealth !== true) continue;
			if (typeof row.model_slug === "string") stealthModelSlugs.add(row.model_slug);
			if (typeof row.provider_model_id === "string") stealthRouteIds.add(row.provider_model_id);
		}
		if (table === "v2_pricing_skus") for (const row of rows) if (stealthRouteIds.has(String(row.provider_model_id))) stealthSkuIds.add(String(row.sku_id));
		rows = rows.filter((row) => row.is_stealth !== true)
			.filter((row) => !stealthModelSlugs.has(String(row.model_slug ?? "")))
			.filter((row) => !stealthRouteIds.has(String(row.provider_model_id ?? "")))
			.filter((row) => !stealthSkuIds.has(String(row.sku_id ?? "")))
			.filter((row) => table !== "v2_catalogue_source_overrides" || (!stealthModelSlugs.has(String(row.source_key ?? "")) && !stealthRouteIds.has(String(row.source_key ?? ""))));
		await writeFile(resolve(OUTPUT_DIR, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
		console.log(`Exported ${table}: ${rows.length} rows`);
	}
	await writeFile(resolve(OUTPUT_DIR, "README.md"), "# Generated database catalogue snapshot\n\nThis directory is generated from the production v2 catalogue tables. Edit catalogue data in the admin UI, not in these files. The daily snapshot workflow opens or updates a reviewable pull request when database state changes.\n", "utf8");
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
