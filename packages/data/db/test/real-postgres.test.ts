/**
 * Runs against a real, multi-session Postgres when PHASEO_DB_TEST_URL is set
 * (an admin URL to a throwaway local cluster; a fresh database is created and
 * dropped). Proves what PGlite cannot: the postgres.js and pg adapters,
 * pipelined setup statements, and that roles/claims never leak between
 * pooled sessions under concurrency.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompatClient } from "../src/client";
import { closeHyperdriveSql, createHyperdriveSql, type PostgresSql } from "../src/connections/hyperdrive";
import { createNodePool } from "../src/connections/node";
import { pgExecutor, postgresJsExecutor, type SqlExecutor } from "../src/executor";
import { fixtureRelationships, schemaSql } from "./helpers";

const adminUrl = process.env.PHASEO_DB_TEST_URL;
const ADA = "00000000-0000-0000-0000-000000000001";
const GRACE = "00000000-0000-0000-0000-000000000002";

describe.skipIf(!adminUrl)("real Postgres (multi-session)", () => {
	const dbName = `phaseo_db_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
	let url: string;
	let pool: pg.Pool;
	let sql: PostgresSql;
	const pending: Promise<unknown>[] = [];

	beforeAll(async () => {
		const admin = new pg.Client({ connectionString: adminUrl });
		await admin.connect();
		await admin.query(`create database ${dbName}`);
		await admin.end();
		const u = new URL(adminUrl!);
		u.pathname = `/${dbName}`;
		url = u.toString();
		const setup = new pg.Client({ connectionString: url });
		await setup.connect();
		// Roles are cluster-wide: create them only once.
		const guarded = schemaSql.replace(/^create role (\w+) ([^;]+);$/gm, (_m, name: string, rest: string) => `do $do$ begin create role ${name} ${rest}; exception when duplicate_object then null; end $do$;`);
		try {
			await setup.query(guarded);
		} finally {
			await setup.end();
		}
		pool = new pg.Pool({ connectionString: url, max: 2 });
		pool.on("error", () => undefined);
		sql = createHyperdriveSql({ connectionString: url }, { max: 2 });
	});

	afterAll(async () => {
		await Promise.allSettled(pending);
		await pool?.end();
		await sql?.end({ timeout: 1 }).catch(() => undefined);
		const admin = new pg.Client({ connectionString: adminUrl });
		await admin.connect();
		await admin.query(`drop database if exists ${dbName} with (force)`);
		await admin.end();
	});

	const executors = (): Array<[string, SqlExecutor]> => [
		["postgres.js (Hyperdrive settings: prepare, fetch_types off)", postgresJsExecutor(sql)],
		["pg Pool", pgExecutor(pool)],
	];

	for (const name of ["postgres.js (Hyperdrive settings: prepare, fetch_types off)", "pg Pool"]) {
		it(`${name}: reads, embeds, rpc, mutations and errors`, async () => {
			const exec = executors().find(([n]) => n === name)![1];
			const client = createCompatClient({ sql: exec, role: "service_role", relationships: fixtureRelationships, tags: { app: "test", route: "/real" }, retry: false });
			const read = await client.from("models").select("model_slug,lab:labs(name),tags(tag_id)").eq("model_slug", "gpt-5").order("tag_id", { referencedTable: "tags" }).single();
			expect(read.data).toEqual({ model_slug: "gpt-5", lab: { name: "OpenAI" }, tags: [{ tag_id: "reasoning" }, { tag_id: "vision" }] });
			const counted = await client.from("models").select("*", { count: "exact", head: true });
			expect(counted.count).toBe(4);
			// Values reach Postgres as text whatever type the server infers (postgres.js would
			// otherwise turn 'true' into 'f' for a boolean and re-encode JSON strings).
			expect((await client.from("models").select("model_slug").eq("hidden", true)).data).toEqual([{ model_slug: "mistral-large" }]);
			expect((await client.from("models").select("model_slug", { count: "exact", head: true }).lt("released_at", "infinity")).count).toBe(3);
			expect((await client.rpc("echo_json", { p: { s: "x", n: [1] } })).data).toEqual({ s: "x", n: [1] });
			expect((await client.rpc("sum_array", { p_values: [40, 2] })).data).toBe(42);
			expect((await client.rpc("get_lab_models", { p_lab: "mistral" }).select("model_slug")).data).toEqual([{ model_slug: "mistral-large" }]);
			const tag = `t-${name.length}-${Math.random().toString(36).slice(2, 8)}`;
			expect((await client.from("tags").insert({ tag_id: tag, label: "x" }).select("tag_id").single()).data).toEqual({ tag_id: tag });
			expect((await client.from("tags").upsert({ tag_id: tag, label: "y" }, { onConflict: "tag_id" }).select("label")).data).toEqual([{ label: "y" }]);
			const dup = await client.from("tags").insert({ tag_id: tag, label: "z" });
			expect(dup.error?.code).toBe("23505");
			// singular mismatch on a mutation rolls back
			const rolled = await client.from("labs").update({ name: "nope" }).neq("lab_slug", "x").select("lab_slug").single();
			expect(rolled.error?.code).toBe("PGRST116");
			expect((await client.from("labs").select("name").eq("lab_slug", "openai").single()).data).toEqual({ name: "OpenAI" });
			// service-role write sets claims for auth.role()-guarded triggers
			expect((await client.from("protected_settings").update({ locked_value: name }).eq("id", 1).select("locked_value")).data).toEqual([{ locked_value: name }]);
		});
	}

	it("roles and claims never leak between pooled sessions under concurrency", async () => {
		for (const [, exec] of executors()) {
			const make = (role: "authenticated" | "anon" | "service_role", sub?: string) =>
				createCompatClient({ sql: exec, role, claims: sub ? { sub } : undefined, relationships: fixtureRelationships, retry: false });
			const ada = make("authenticated", ADA);
			const grace = make("authenticated", GRACE);
			const anon = make("anon");
			const svc = make("service_role");
			const jobs = Array.from({ length: 40 }, (_, i) => {
				switch (i % 4) {
					case 0:
						return ada.from("notes").select("body").then((r) => expect(r.data).toEqual([{ body: "ada note" }]));
					case 1:
						return grace.from("notes").select("body").then((r) => expect(r.data).toEqual([{ body: "grace note" }]));
					case 2:
						return anon.from("notes").select("body").then((r) => expect(r.error?.code).toBe("42501"));
					default:
						return svc.from("notes").select("body", { count: "exact", head: true }).then((r) => expect(r.count).toBe(2));
				}
			});
			await Promise.all(jobs);
			expect((await ada.rpc("current_role_name")).data).toBe("authenticated");
			expect((await svc.rpc("current_role_name")).data).toBe("postgres");
			expect((await svc.rpc("whoami")).data).toBeNull();
		}
		const leftovers = await pool.query("select current_user::text as role, nullif(current_setting('request.jwt.claims', true), '') as claims");
		expect(leftovers.rows).toEqual([{ role: "postgres", claims: null }]);
	});

	it("abortSignal(AbortSignal.timeout) bounds the wait on a slow statement", async () => {
		const meta = structuredClone(fixtureRelationships);
		meta.functions["public.pg_sleep_probe"] = [{ args: [{ name: "s", type: "double precision", hasDefault: false }], returnType: "integer", returnsSet: false, returnKind: "scalar", returnRelation: null, volatility: "v" }];
		const setup = new pg.Client({ connectionString: url });
		await setup.connect();
		await setup.query("create or replace function public.pg_sleep_probe(s double precision) returns int language sql as $fn$ select 1 from pg_sleep(s) $fn$");
		await setup.end();
		for (const [, exec] of executors()) {
			const client = createCompatClient({ sql: exec, role: "service_role", relationships: meta, retry: false });
			const started = Date.now();
			const res = await client.rpc("pg_sleep_probe", { s: 0.5 }).abortSignal(AbortSignal.timeout(50));
			expect(Date.now() - started).toBeLessThan(400);
			expect(res.error?.message).toMatch(/TimeoutError|AbortError|aborted/i);
		}
	});

	it("the same postgres.js client keeps its normal serializers for tagged queries", async () => {
		postgresJsExecutor(sql);
		const [row] = await sql`select ${true}::bool as b, ${sql.json({ a: 1 })}::jsonb as j, ${"txt"}::text as t`;
		expect(row).toEqual({ b: true, j: { a: 1 }, t: "txt" });
	});

	it("closeHyperdriveSql ends the client through waitUntil", async () => {
		const own = createHyperdriveSql({ connectionString: url });
		const client = createCompatClient({ sql: postgresJsExecutor(own), role: "anon", relationships: fixtureRelationships, retry: false });
		expect((await client.from("labs").select("lab_slug").eq("lab_slug", "openai")).data).toEqual([{ lab_slug: "openai" }]);
		closeHyperdriveSql(own, { waitUntil: (p) => pending.push(p) });
		await Promise.all(pending);
		await expect(own`select 1`).rejects.toThrow();
	});
});

describe("createNodePool", () => {
	it("is max 1 with TLS verify-full, and strips sslmode overrides from the URL", () => {
		const pool = createNodePool({ connectionString: "postgres://u:p@db.example.com:6432/app?sslmode=no-verify&application_name=x" });
		const opts = (pool as unknown as { options: Record<string, unknown> }).options;
		expect(opts.max).toBe(1);
		expect(opts.ssl).toEqual({ rejectUnauthorized: true });
		expect(String(opts.connectionString)).not.toContain("sslmode");
		void pool.end();
	});
});
