// Copies packages/shared/model-parameters into each app that reads route parameter specs:
// the gateway's models API and the web playground.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/model-parameters/index.ts";
const TARGETS = [
	"apps/api/src/core/model-parameters.ts",
	"apps/web/src/lib/models/modelParameters.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-model-parameters.mjs. Do not edit.\n${await read(SOURCE)}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	console.error("Run `node scripts/sync-model-parameters.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Model parameter copies are up to date." : "Model parameter copies synced.");
