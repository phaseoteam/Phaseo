#!/usr/bin/env node
// Generate @phaseo/db's static relationship + function metadata.
//
//   node packages/data/db/scripts/generate-relationships.mjs "$DATABASE_URL" > packages/data/db/src/generated/relationships.json
//   node packages/data/db/scripts/build-relationships-module.mjs   (writes relationships.ts, which apps import)
//
// Runs one read-only introspection query (see relationships-introspection.mjs).
// Point it at a database with the full schema (a PlanetScale branch, or a local
// Postgres with database/planetscale/migrations applied), never at production
// writes. Apps bundle relationships.ts (built from the JSON); nothing introspects per request.
import pg from "pg";
import { INTROSPECTION_SQL, RELATION_SCHEMAS, RPC_SCHEMAS, shapeMetadata } from "./relationships-introspection.mjs";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
	console.error("usage: generate-relationships.mjs <DATABASE_URL>");
	process.exit(2);
}

const client = new pg.Client({ connectionString: url, application_name: "phaseo-db-generate-relationships" });
await client.connect();
try {
	await client.query("begin read only");
	await client.query("set local search_path = ''");
	const { rows } = await client.query(INTROSPECTION_SQL, [RELATION_SCHEMAS, RPC_SCHEMAS]);
	await client.query("rollback");
	const metadata = shapeMetadata(rows[0].metadata);
	process.stdout.write(`${JSON.stringify(metadata, null, "\t")}\n`);
	console.error(
		`relationships: ${Object.keys(metadata.tables).length} relations, ${metadata.foreignKeys.length} foreign keys, ${Object.values(metadata.functions).flat().length} functions`,
	);
} finally {
	await client.end();
}
