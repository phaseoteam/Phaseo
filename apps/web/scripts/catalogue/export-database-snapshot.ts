/* eslint-disable no-console -- scheduled export reports per-table progress */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { client } from "../importer/supa";
import { buildEnumSnapshot } from "./enumSnapshot";
import { filterPublicSnapshotRows } from "./exportSnapshotPrivacy";

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
	v2_subscription_plan_features: ["plan_uuid", "feature_name"],
} as const;
type TableName = keyof typeof TABLES;

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

async function fetchTable(table: TableName): Promise<Record<string, unknown>[]> {
	const supabase = client();
	const rows: Record<string, unknown>[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		let query: any = supabase.from(table).select("*");
		for (const column of TABLES[table]) query = query.order(column, { ascending: true });
		const result = await query.range(from, from + PAGE_SIZE - 1);
		if (result.error) throw new Error(`Failed to export ${table}: ${result.error.message}`);
		const page = (result.data ?? []) as Record<string, unknown>[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows
		.map((row) => stableValue(row) as Record<string, unknown>)
		.sort((left, right) => stableRowKey(left).localeCompare(stableRowKey(right)));
}

async function main() {
	// An updated_at cutoff is not a database snapshot: it drops rows changed
	// during export and legacy rows with null timestamps. Export the full tables.
	// Collect every table before writing so a failed query preserves the prior export.
	const snapshots = new Map<TableName, Record<string, unknown>[]>();
	for (const table of Object.keys(TABLES) as TableName[]) {
		snapshots.set(table, await fetchTable(table));
	}
	const publicSnapshots = filterPublicSnapshotRows(snapshots);
	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(resolve(OUTPUT_DIR, "enum-catalog.json"), `${JSON.stringify(buildEnumSnapshot(publicSnapshots), null, 2)}\n`, "utf8");
	for (const [table, rows] of publicSnapshots) {
		console.log(`Exported ${table}: ${rows.length} rows`);
		await writeFile(resolve(OUTPUT_DIR, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
	}
	await writeFile(resolve(OUTPUT_DIR, "README.md"), "# Generated database catalogue snapshot\n\nThis directory is generated from the production v2 catalogue tables. Edit catalogue data in the admin UI, not in these files. The daily snapshot workflow opens or updates a reviewable pull request when database state changes.\n", "utf8");
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
