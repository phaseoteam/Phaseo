// Copies packages/shared/slack-agent-pricing into each app that shows, enforces
// or charges the Slack agent's price.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/slack-agent-pricing/index.ts";
const TARGETS = [
	"apps/web-api/src/billing/slackAgentPricing.ts",
	"apps/slack/src/lib/slackAgentPricing.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-slack-agent-pricing.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-slack-agent-pricing.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Slack agent pricing copies are up to date." : "Slack agent pricing copies synced.");
