/* eslint-disable no-console -- scheduled export reports per-table progress */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { client } from "../importer/supa";
import { buildEnumSnapshot } from "./enumSnapshot";
import { filterPublicSnapshotRows } from "./exportSnapshotPrivacy";
import { PUBLIC_CATALOG_TABLE_NAMES, PUBLIC_CATALOG_TABLES, type PublicCatalogTableName } from "./exportSnapshotTables";

const PAGE_SIZE = 1_000;
const OUTPUT_DIR = resolve(process.cwd(), "../../packages/data/catalog/generated/database-v2");

type TableName = PublicCatalogTableName;

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
		for (const column of PUBLIC_CATALOG_TABLES[table]) query = query.order(column, { ascending: true });
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

async function removeStaleSnapshotFiles() {
	const allowedFiles = new Set([
		"enum-catalog.json",
		...PUBLIC_CATALOG_TABLE_NAMES.map((table) => `${table}.json`),
	]);
	for (const filename of await readdir(OUTPUT_DIR)) {
		if (filename.endsWith(".json") && !allowedFiles.has(filename)) await rm(resolve(OUTPUT_DIR, filename), { force: true });
	}
}

async function main() {
	// An updated_at cutoff is not a database snapshot: it drops rows changed
	// during export and legacy rows with null timestamps. Export the full tables.
	// Collect every table before writing so a failed query preserves the prior export.
	const snapshots = new Map<TableName, Record<string, unknown>[]>();
	for (const table of PUBLIC_CATALOG_TABLE_NAMES) {
		snapshots.set(table, await fetchTable(table));
	}
	const publicSnapshots = filterPublicSnapshotRows(snapshots);
	await mkdir(OUTPUT_DIR, { recursive: true });
	await removeStaleSnapshotFiles();
	await writeFile(resolve(OUTPUT_DIR, "enum-catalog.json"), `${JSON.stringify(buildEnumSnapshot(publicSnapshots), null, 2)}\n`, "utf8");
	for (const table of PUBLIC_CATALOG_TABLE_NAMES) {
		const rows = publicSnapshots.get(table) ?? [];
		console.log(`Exported ${table}: ${rows.length} rows`);
		await writeFile(resolve(OUTPUT_DIR, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
	}
	await writeFile(resolve(OUTPUT_DIR, "README.md"), "# Generated database catalogue snapshot\n\nThis directory is generated from the production v2 catalogue tables. Edit catalogue data in the admin UI, not in these files. The daily snapshot workflow opens or updates a reviewable pull request when database state changes.\n", "utf8");
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
