// Copies packages/shared/request-classifiers into each app that validates
// classifiers or builds their request, and checks the per-workspace limit
// against the database trigger that repeats it.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/request-classifiers/index.ts";
const TARGETS = [
	"apps/api/src/core/request-classifiers.ts",
	"apps/web-api/src/routes/account/request-classifiers.ts",
	"apps/web/src/components/(gateway)/settings/classifiers/requestClassifiers.ts",
];
const TRIGGER = "supabase/schemas/public/functions/enforce_request_classifier_limit.sql";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-request-classifiers.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

const limit = source.match(/MAX_CLASSIFIERS_PER_WORKSPACE = (\d+);/)?.[1];
const trigger = await read(TRIGGER);
if (!limit || trigger.match(/v_limit constant integer := (\d+);/)?.[1] !== limit) {
	problems.push(`${TRIGGER} limit does not match MAX_CLASSIFIERS_PER_WORKSPACE (${limit})`);
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-request-classifiers.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Request classifier copies are up to date." : "Request classifier copies synced.");
