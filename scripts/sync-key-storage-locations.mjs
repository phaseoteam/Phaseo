// Copies packages/shared/key-storage-locations into each app that validates
// or shows where a key is stored, and checks the per-key limit against the
// database function that repeats it and the logos against the web app's files.
// Run with --check in CI to fail on drift instead of writing.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/key-storage-locations/index.ts";
const TARGETS = [
	"apps/api/src/core/key-storage-locations.ts",
	"apps/web-api/src/routes/account/key-storage-locations.ts",
	"apps/web/src/components/(gateway)/settings/keys/keyStorageLocations.ts",
];
const FUNCTION = "supabase/schemas/public/functions/valid_key_storage_locations.sql";
const LOGO_DIR = "apps/web/public/logos/key-storage";
const LOGO_LIST = "apps/web/src/components/(gateway)/settings/keys/keyStorageLogos.ts";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-key-storage-locations.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

const limit = source.match(/MAX_KEY_STORAGE_LOCATIONS = (\d+);/)?.[1];
const fn = await read(FUNCTION);
if (!limit || fn.match(/cardinality\(locations\) <= (\d+)/)?.[1] !== limit) {
	problems.push(`${FUNCTION} limit does not match MAX_KEY_STORAGE_LOCATIONS (${limit})`);
}

// Ids must be unique and fit the database pattern.
const ids = [...source.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
for (const id of ids) {
	if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) problems.push(`Location id ${id} does not match the database pattern`);
}
if (new Set(ids).size !== ids.length) problems.push("Location ids are not unique");

// Every logo file belongs to a location, and the web app lists exactly those files.
const logos = (await readdir(path.join(root, LOGO_DIR))).filter((file) => file.endsWith(".svg")).map((file) => file.slice(0, -4)).sort();
for (const logo of logos) if (!ids.includes(logo)) problems.push(`${LOGO_DIR}/${logo}.svg has no location`);
const listed = [...(await read(LOGO_LIST)).matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]).sort();
if (JSON.stringify(listed) !== JSON.stringify(logos)) problems.push(`${LOGO_LIST} does not list exactly the files in ${LOGO_DIR}`);

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-key-storage-locations.mjs` after editing the shared module.");
	process.exit(1);
}
console.log(check ? "Key storage location copies are up to date." : "Key storage location copies synced.");
