// Copies packages/shared/workspace-routing-settings into each app that
// validates auto-routing and successor routing settings: the settings API and
// the gateway's /v1 control plane.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/workspace-routing-settings/index.ts";
const TARGETS = [
	"apps/api/src/core/workspace-routing-settings.ts",
	"apps/web-api/src/routes/account/workspace-routing-settings.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-workspace-routing-settings.mjs. Do not edit.\n${await read(SOURCE)}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	console.error("Run `node scripts/sync-workspace-routing-settings.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Workspace routing settings copies are up to date." : "Workspace routing settings copies synced.");
