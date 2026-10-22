// Copies packages/shared/mcp-connections into each app that reads or writes
// connected MCP server secrets or runs their OAuth steps, and checks the label
// rule against the table constraint that repeats it.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/mcp-connections/index.ts";
const OAUTH_SOURCE = "packages/shared/mcp-connections/oauth.ts";
const COPIES = [
	{ source: SOURCE, target: "apps/api/src/core/mcp-connections-shared.ts" },
	{ source: SOURCE, target: "apps/web-api/src/lib/mcp-connections-shared.ts" },
	{ source: OAUTH_SOURCE, target: "apps/api/src/core/mcp-connections-oauth.ts" },
	{ source: OAUTH_SOURCE, target: "apps/web-api/src/lib/mcp-connections-oauth.ts" },
];
const TABLE = "supabase/schemas/public/tables/mcp_connections.sql";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const problems = [];

for (const copy of COPIES) {
	const output = normalize(`// Generated from ${copy.source} by scripts/sync-mcp-connections.mjs. Do not edit.\n${await read(copy.source)}`);
	const current = await read(copy.target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${copy.target} is out of date`);
	else await writeFile(path.join(root, copy.target), output, "utf8");
}

const pattern = (await read(SOURCE)).match(/LABEL_SLUG_PATTERN = \/(.+)\/;/)?.[1];
const table = await read(TABLE);
if (!pattern || table.match(/label_slug ~ '(.+?)'::text/)?.[1] !== pattern) {
	problems.push(`${TABLE} label_slug_check does not match LABEL_SLUG_PATTERN (${pattern})`);
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-mcp-connections.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "MCP connection copies are up to date." : "MCP connection copies synced.");
