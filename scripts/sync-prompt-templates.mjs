// Copies packages/shared/prompt-templates into each app that validates or
// renders preset prompt templates, so the editor preview, the save checks and
// the gateway all use the same parser and limits.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/prompt-templates/index.ts";
const TARGETS = [
	"apps/api/src/core/prompt-templates.ts",
	"apps/web-api/src/routes/account/prompt-templates.ts",
	"apps/web/src/components/(gateway)/settings/presets/promptTemplates.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-prompt-templates.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-prompt-templates.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Prompt template copies are up to date." : "Prompt template copies synced.");
