// Copies packages/shared/broadcast-destinations into each app that uses
// it, and checks the registry against the database definitions that repeat it.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/broadcast-destinations/index.ts";
const COPIES = [
	{ source: SOURCE, target: "apps/api/src/observability/broadcast-destinations.ts" },
	{ source: SOURCE, target: "apps/web-api/src/routes/account/broadcast-destinations.ts" },
	{ source: SOURCE, target: "apps/web/src/components/(gateway)/settings/observability/broadcastDestinations.ts" },
	{ source: "packages/shared/broadcast-destinations/otlp-protobuf.ts", target: "apps/api/src/observability/otlp-protobuf.ts" },
	{ source: "packages/shared/broadcast-destinations/otlp-protobuf.ts", target: "apps/web-api/src/routes/account/otlp-protobuf.ts" },
];
const TABLE = "supabase/schemas/public/tables/workspace_broadcast_destinations.sql";
const TRIGGER = "supabase/schemas/public/functions/enforce_broadcast_destination_limit.sql";
const OPENAPI = "apps/docs/openapi/v1/openapi.yaml";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const source = await read(SOURCE);
const problems = [];

for (const copy of COPIES) {
	const { target } = copy;
	const output = `// Generated from ${copy.source} by scripts/sync-broadcast-destinations.mjs. Do not edit.\n${await read(copy.source)}`;
	const current = await read(target).catch(() => null);
	if (current?.replace(/\r\n/g, "\n") === output.replace(/\r\n/g, "\n")) continue;
	if (check) problems.push(`${target} is out of date`);
	else await writeFile(path.join(root, target), output, "utf8");
}

const ids = [...source.matchAll(/\{ id: "([a-z0-9_]+)", delivery:/g)].map((match) => match[1]).sort();
const table = await read(TABLE);
const constraint = table.match(/destination_id_check"\s*CHECK\s*\(\(destination_id = ANY \(ARRAY\[([\s\S]*?)\]\)\)\)/);
const allowed = constraint ? [...constraint[1].matchAll(/'([a-z0-9_]+)'::text/g)].map((match) => match[1]).sort() : [];
if (ids.join() !== allowed.join()) {
	problems.push(`${TABLE} destination_id_check allows [${allowed.join(", ")}], registry has [${ids.join(", ")}]`);
}

const available = [...source.matchAll(/\{ id: "([a-z0-9_]+)", delivery: "/g)].map((match) => match[1]).sort();
const openapi = await read(OPENAPI);
const documented = openapi.match(/\n    ObservabilityDestinationType:\n      type: string\n      enum:\n((?:        - [a-z0-9_]+\n)+)/)?.[1]
	.split("\n").map((line) => line.replace("- ", "").trim()).filter(Boolean).sort() ?? [];
if (available.join() !== documented.join()) {
	problems.push(`${OPENAPI} ObservabilityDestinationType lists [${documented.join(", ")}], available destinations are [${available.join(", ")}]`);
}

const trigger = await read(TRIGGER);
const limit = source.match(/DEFAULT_BROADCAST_DESTINATIONS_PER_TYPE = (\d+);/)?.[1];
const error = source.match(/BROADCAST_DESTINATION_LIMIT_ERROR = "([a-z_]+)";/)?.[1];
if (!limit || trigger.match(/\),\s*(\d+)\) into v_limit;/)?.[1] !== limit) {
	problems.push(`${TRIGGER} default limit does not match DEFAULT_BROADCAST_DESTINATIONS_PER_TYPE (${limit})`);
}
if (!error || !trigger.includes(`raise exception '${error}'`)) {
	problems.push(`${TRIGGER} does not raise BROADCAST_DESTINATION_LIMIT_ERROR (${error})`);
}

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-broadcast-destinations.mjs` after editing the registry.");
	process.exit(1);
}
console.log(check ? "Broadcast destination registry copies are up to date." : "Broadcast destination registry synced.");
