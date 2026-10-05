import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { duplicateMigrationPairs, recordedMigrationSql } from "./declarative-replay-history.mjs";

// Only these reviewed timestamp duplicates can be omitted, and only when the
// destination already records exactly the restored SQL. No history is repaired.
export function productionDuplicatesToOmit(rows, readMigration) {
	const omitted = [];
	for (const [duplicate, recorded] of duplicateMigrationPairs) {
		const version = recorded.split("_")[0];
		const remote = rows.find((row) => row.version === version);
		if (!remote) continue;
		const sql = recordedMigrationSql(readMigration(recorded));
		if (!Array.isArray(remote.statements) ||
			remote.statements.join("\n").replaceAll("\r\n", "\n").trim() !== sql ||
			readMigration(duplicate).replaceAll("\r\n", "\n").trim() !== sql) {
			throw new Error(`Production migration SQL differs for ${version}; stop for review`);
		}
		// If both versions are recorded, leave both files for CLI history matching.
		if (!rows.some((row) => row.version === duplicate.split("_")[0])) omitted.push(duplicate);
	}
	return omitted;
}

async function main() {
	if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Run only in the disposable CI checkout");
	const project = process.env.SUPABASE_PROJECT_ID;
	const token = process.env.SUPABASE_ACCESS_TOKEN;
	if (!project || !/^[a-z0-9]+$/.test(project) || !token) throw new Error("Missing production migration configuration");
	const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			query: "select version, statements from supabase_migrations.schema_migrations where version >= '20261004220000' order by version",
			read_only: true,
		}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`Cannot verify production migration history (HTTP ${response.status})`);
	const rows = await response.json();
	if (!Array.isArray(rows)) throw new Error("Unexpected production migration history response");
	const directory = resolve("supabase/migrations");
	const omitted = productionDuplicatesToOmit(rows, (name) => readFileSync(resolve(directory, name), "utf8"));
	// Verification of every pair completes before changing this ephemeral checkout.
	for (const name of omitted) {
		unlinkSync(resolve(directory, name));
		console.log(`Omitted already-applied timestamp duplicate from CI checkout: ${name}`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
