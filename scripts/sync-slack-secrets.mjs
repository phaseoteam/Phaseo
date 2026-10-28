// Copies packages/shared/slack-secrets into each app that encrypts or decrypts
// Slack agent secrets or signs and verifies its tokens (web-api and the Slack
// Worker), so both read and write one format.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/slack-secrets/index.ts";
const TARGETS = [
	"apps/web-api/src/lib/slack-secrets.ts",
	"apps/slack/src/lib/slack-secrets.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-slack-secrets.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-slack-secrets.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Slack agent secrets copies are up to date." : "Slack agent secrets copies synced.");
