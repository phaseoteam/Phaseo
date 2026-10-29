// Copies packages/shared/key-ip-allowlist into each app that validates API key
// IP allowlists: the settings API and the gateway's /v1 control plane.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/key-ip-allowlist/index.ts";
const TARGETS = [
	"apps/api/src/core/key-ip-allowlist.ts",
	"apps/web-api/src/routes/account/keyIpAllowlist.ts",
];

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-key-ip-allowlist.mjs. Do not edit.\n${await read(SOURCE)}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	console.error("Run `node scripts/sync-key-ip-allowlist.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Key IP allowlist copies are up to date." : "Key IP allowlist copies synced.");
