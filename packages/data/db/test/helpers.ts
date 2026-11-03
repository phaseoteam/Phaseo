import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { type CompatClient, createCompatClient, type CompatClientOptions } from "../src/client";
import type { SqlExecutor, SqlParam, SqlRow } from "../src/executor";
import type { QueryEvent } from "../src/postgrest/fetch";
import type { RelationshipMetadata } from "../src/relationships";

export const schemaSql = readFileSync(new URL("./fixtures/schema.sql", import.meta.url), "utf8");
export const fixtureRelationships = JSON.parse(readFileSync(new URL("./fixtures/relationships.json", import.meta.url), "utf8")) as RelationshipMetadata;

export async function createFixtureDb(): Promise<PGlite> {
	const db = new PGlite();
	await db.exec(schemaSql);
	return db;
}

type PgliteQueryable = { query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> };

/**
 * PGlite executor. PGlite runs one statement at a time; queries issued back
 * to back (setup + statement) are chained so they keep their order.
 */
export function pgliteExecutor(db: PGlite, log?: Array<{ sql: string; params: readonly SqlParam[] }>): SqlExecutor {
	const wrap = (q: PgliteQueryable): SqlExecutor["query"] => {
		let chain: Promise<unknown> = Promise.resolve();
		return (text, params) => {
			log?.push({ sql: text, params });
			const run = chain.then(() => q.query<SqlRow>(text, params as unknown[]).then((r) => r.rows));
			chain = run.catch(() => undefined);
			return run;
		};
	};
	const top = wrap(db);
	return {
		query: top,
		transaction: (fn) =>
			db.transaction(async (tx) => {
				const scoped: SqlExecutor = { query: wrap(tx), transaction: (inner) => inner(scoped) };
				return fn(scoped);
			}),
	};
}

export type TestClient = CompatClient<any> & { events: QueryEvent[]; statements: Array<{ sql: string; params: readonly SqlParam[] }> };

export function makeClient(db: PGlite, options: Partial<CompatClientOptions> = {}): TestClient {
	const events: QueryEvent[] = [];
	const statements: Array<{ sql: string; params: readonly SqlParam[] }> = [];
	const client = createCompatClient({
		sql: pgliteExecutor(db, statements),
		role: "service_role",
		relationships: fixtureRelationships,
		tags: { app: "test", route: "/test" },
		retry: false,
		onQuery: (e) => events.push(e),
		...options,
	}) as TestClient;
	Object.defineProperty(client, "events", { value: events });
	Object.defineProperty(client, "statements", { value: statements });
	return client;
}
