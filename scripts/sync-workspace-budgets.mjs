// Copies packages/shared/workspace-budgets into each app that validates
// workspace budget writes, and checks the intervals against the table CHECK.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/workspace-budgets/index.ts";
const TARGETS = [
	"apps/api/src/core/workspace-budgets.ts",
	"apps/web-api/src/routes/account/workspace-budgets.ts",
	"apps/web/src/components/(gateway)/settings/budgets/workspaceBudgets.ts",
];
const TABLE = "supabase/schemas/public/tables/workspace_budgets.sql";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-workspace-budgets.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

const intervals = source.match(/BUDGET_INTERVALS = \[([^\]]+)\]/)?.[1]?.match(/"([a-z]+)"/g)?.map((value) => value.slice(1, -1)) ?? [];
const table = await read(TABLE);
const tableIntervals = table.match(/workspace_budgets_interval_check" CHECK \(\("interval" = ANY \(ARRAY\[([^\]]+)\]/)?.[1]
	?.match(/'([a-z]+)'/g)?.map((value) => value.slice(1, -1)) ?? [];
if (!intervals.length || intervals.join(",") !== tableIntervals.join(",")) {
	problems.push(`${TABLE} intervals (${tableIntervals.join(", ")}) do not match BUDGET_INTERVALS (${intervals.join(", ")})`);
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-workspace-budgets.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Workspace budget copies are up to date." : "Workspace budget copies synced.");
