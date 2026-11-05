// Copies the guardrail modules the settings page shares with the APIs:
// - packages/shared/provider-aliases: the gateway's provider id aliases, so the assignments view
//   merges provider lists the way the gateway enforces them.
// - packages/shared/guardrail-assignment-limits: the size limits of one assignment change.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
	{
		source: "packages/shared/provider-aliases/index.ts",
		targets: [
			"apps/api/src/lib/config/providerAliases.ts",
			"apps/web/src/components/(gateway)/settings/guardrails/providerAliases.ts",
		],
	},
	{
		source: "packages/shared/guardrail-assignment-limits/index.ts",
		targets: [
			"apps/web-api/src/routes/account/guardrailAssignmentLimits.ts",
			"apps/web/src/components/(gateway)/settings/guardrails/guardrailAssignmentLimits.ts",
		],
	},
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const problems = [];

for (const { source, targets } of MODULES) {
	const output = normalize(`// Generated from ${source} by scripts/sync-guardrail-shared.mjs. Do not edit.\n${await read(source)}`);
	for (const target of targets) {
		const current = await read(target).catch(() => null);
		if (current != null && normalize(current) === output) continue;
		if (check) problems.push(`${target} is out of date`);
		else await writeFile(path.join(root, target), output, "utf8");
	}
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	console.error("Run `node scripts/sync-guardrail-shared.mjs` after editing a shared module.");
	process.exit(1);
}
console.log(check ? "Shared guardrail module copies are up to date." : "Shared guardrail module copies synced.");
