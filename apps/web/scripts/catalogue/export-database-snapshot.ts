/* eslint-disable no-console -- scheduled export reports per-table progress */
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { client } from "./database";
import { buildEnumSnapshot } from "./enumSnapshot";
import { filterPublicSnapshotRows } from "./exportSnapshotPrivacy";
import { PUBLIC_CATALOG_TABLE_COLUMNS, PUBLIC_CATALOG_TABLE_NAMES, PUBLIC_CATALOG_TABLES, type PublicCatalogTableName } from "./exportSnapshotTables";

const PAGE_SIZE = 1_000;
const OUTPUT_DIR = resolve(process.cwd(), "../../packages/data/catalog/generated/database-v2");
const DRY_RUN = process.argv.includes("--dry-run");
const README_CONTENT = "# Generated database catalogue snapshot\n\nThis directory is generated from the production v2 catalogue tables. Edit catalogue data in the admin UI, not in these files. The daily snapshot workflow opens or updates a reviewable pull request when database state changes.\n";

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
		let query: any = supabase.from(table).select(PUBLIC_CATALOG_TABLE_COLUMNS[table].join(","));
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
	for (const filename of await staleSnapshotFiles()) await rm(resolve(OUTPUT_DIR, filename), { force: true });
}

async function staleSnapshotFiles(): Promise<string[]> {
	const allowedFiles = new Set(["enum-catalog.json", ...PUBLIC_CATALOG_TABLE_NAMES.map((table) => `${table}.json`)]);
	let filenames: string[];
	try {
		filenames = await readdir(OUTPUT_DIR);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
		throw error;
	}
	return filenames.filter((filename) => filename.endsWith(".json") && !allowedFiles.has(filename));
}

function outputContent(publicSnapshots: ReadonlyMap<TableName, Record<string, unknown>[]>) {
	const files = [
		{
			filename: "enum-catalog.json",
			content: `${JSON.stringify(buildEnumSnapshot(publicSnapshots), null, 2)}\n`,
		},
		...PUBLIC_CATALOG_TABLE_NAMES.map((table) => ({
			filename: `${table}.json`,
			content: `${JSON.stringify(publicSnapshots.get(table) ?? [], null, 2)}\n`,
		})),
		{ filename: "README.md", content: README_CONTENT },
	];
	return files;
}

function contentHash(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

async function printDryRun(publicSnapshots: ReadonlyMap<TableName, Record<string, unknown>[]>) {
	const files = outputContent(publicSnapshots);
	const staleFiles = await staleSnapshotFiles();
	console.log("Dry run: no files were written and no files were removed.");
	console.log("Would write:");
	for (const file of files) {
		const table = file.filename.endsWith(".json") ? file.filename.slice(0, -5) : null;
		const rows = table && PUBLIC_CATALOG_TABLE_NAMES.includes(table as TableName) ? publicSnapshots.get(table as TableName)?.length ?? 0 : null;
		console.log(`- ${file.filename}${rows === null ? "" : ` (${rows} rows)`}: ${Buffer.byteLength(file.content, "utf8")} bytes, sha256 ${contentHash(file.content)}`);
	}
	console.log(staleFiles.length ? "Would remove:" : "Would remove: none");
	for (const filename of staleFiles) console.log(`- ${filename}`);
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
	if (DRY_RUN) {
		await printDryRun(publicSnapshots);
		return;
	}
	await mkdir(OUTPUT_DIR, { recursive: true });
	await removeStaleSnapshotFiles();
	for (const file of outputContent(publicSnapshots)) {
		const table = file.filename.endsWith(".json") ? file.filename.slice(0, -5) : null;
		if (table && PUBLIC_CATALOG_TABLE_NAMES.includes(table as TableName)) console.log(`Exported ${table}: ${publicSnapshots.get(table as TableName)?.length ?? 0} rows`);
		await writeFile(resolve(OUTPUT_DIR, file.filename), file.content, "utf8");
	}
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
