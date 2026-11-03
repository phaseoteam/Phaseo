import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { UNSUPPORTED_CODE, utf8ByteLength } from "../src/postgrest/fetch";
import { quoteIdent } from "../src/sql/identifiers";
import { formatQueryTag, tagStatement } from "../src/tags";
import type { SqlExecutor } from "../src/executor";
import { createFixtureDb, makeClient, pgliteExecutor, type TestClient } from "./helpers";

let db: PGlite;
let client: TestClient;

beforeAll(async () => {
	db = await createFixtureDb();
	client = makeClient(db);
});

async function raw(path: string, init: RequestInit = {}) {
	const fetchFn = (client as unknown as { fetch: typeof fetch }).fetch;
	const res = await fetchFn(`http://phaseo-db.invalid${path}`, init);
	return { status: res.status, body: await res.text() };
}

describe("query tags", () => {
	it("formats sqlcommenter tags: sorted keys, URL-encoded quoted values", () => {
		expect(formatQueryTag({ route: "/api/_web/models", app: "web-api", table: "v2_models" })).toBe("/*app='web-api',route='%2Fapi%2F_web%2Fmodels',table='v2_models'*/");
	});

	it("cannot break out of the quote or the comment", () => {
		const tag = formatQueryTag({ app: "x'*/; drop table users; --", route: "/a b?c=d" });
		expect(tag).toBe("/*app='x__%2F__drop_table_users__--',route='%2Fa_b_c_d'*/");
		expect(tag.indexOf("*/")).toBe(tag.length - 2);
	});

	it("is appended at the end of the statement, before a semicolon (PlanetScale ignores tags after it)", () => {
		expect(tagStatement("select 1", { app: "a" })).toBe("select 1 /*app='a'*/");
		expect(tagStatement("select 1;", { app: "a" })).toBe("select 1 /*app='a'*/;");
		expect(tagStatement("select 1", {})).toBe("select 1");
	});

	it("every statement carries app, route and table", async () => {
		await client.from("labs").select("name").limit(1);
		expect(client.statements.at(-1)!.sql).toMatch(/ \/\*app='test',route='%2Ftest',table='labs'\*\/$/);
	});
});

describe("identifier and value safety", () => {
	it("quoteIdent only accepts [A-Za-z_][A-Za-z0-9_]*", () => {
		expect(quoteIdent("v2_models")).toBe('"v2_models"');
		for (const bad of ['a"b', "a b", "1abc", "a;drop", "é", "", "a.b"]) expect(() => quoteIdent(bad)).toThrow();
	});

	it("hostile table, column, alias and hint names are refused before reaching SQL", async () => {
		for (const path of [
			"/labs%22;drop%20table%20labs;--?select=*",
			"/labs?select=name%22,x",
			"/labs?select=x:name::text);drop",
			"/labs?order=name;drop",
			"/labs?select=models!a%22b(*)",
		]) {
			const r = await raw(path);
			expect(r.status, path).toBeGreaterThanOrEqual(400);
		}
		expect((await db.query("select count(*)::int as n from labs")).rows).toEqual([{ n: 3 }]);
	});

	it("values are always parameters (an injection attempt is just a string)", async () => {
		const res = await client.from("labs").select("lab_slug").eq("name", "x' or '1'='1");
		expect(res.data).toEqual([]);
		const last = client.statements.at(-1)!;
		expect(last.sql).not.toContain("1'='1");
		expect(last.params).toContain("x' or '1'='1");
	});
});

describe("unsupported features fail loudly", () => {
	const cases: Array<[string, () => PromiseLike<{ error: { code: string; message: string } | null; status: number }>]> = [
		["csv()", () => client.from("labs").select("*").csv() as never],
		["explain()", () => client.from("labs").select("*").explain() as never],
		["count: planned", () => client.from("labs").select("*", { count: "planned" })],
		["count: estimated", () => client.from("labs").select("*", { count: "estimated" })],
		["spread embed", () => client.from("models").select("model_slug,...labs(name)")],
		["aggregates", () => client.from("models").select("count()")],
		["defaultToNull: false", () => client.from("tags").insert([{ tag_id: "z" }], { defaultToNull: false })],
		["limited update", () => client.from("tags").update({ label: "x" }).eq("tag_id", "nope").limit(1) as never],
		["order by embedded column", () => client.from("models").select("model_slug,labs(name)").order("labs(name)")],
		["rollback()", () => client.from("labs").select("*").rollback() as never],
	];
	for (const [name, run] of cases) {
		it(name, async () => {
			const res = await run();
			expect(res.status).toBe(501);
			expect(res.error?.code).toBe(UNSUPPORTED_CODE);
			expect(res.error?.message).toMatch(/@phaseo\/db/);
		});
	}
});

describe("onQuery", () => {
	it("reports app, route, table, kind, rows, bytes (UTF-8 of the returned JSON) and ms", async () => {
		const c = makeClient(db, { tags: { app: "gateway", route: "/v1/models" } });
		await c.from("tags").insert({ tag_id: "uni", label: "日本語 – ✓ 😀" });
		const fetchFn = (c as unknown as { fetch: typeof fetch }).fetch;
		const res = await fetchFn("http://phaseo-db.invalid/tags?select=label&tag_id=eq.uni");
		const body = await res.text();
		const ev = c.events.at(-1)!;
		expect(body).toBe('[{"label":"日本語 – ✓ 😀"}]');
		expect(ev).toMatchObject({ app: "gateway", route: "/v1/models", table: "tags", kind: "select", rows: 1, status: 200 });
		expect(ev.bytes).toBe(new TextEncoder().encode(body).length);
		expect(ev.bytes).toBe(36); // 11 + 9 (日本語) + 5 ( – ) + 3 (✓) + 1 + 4 (😀) + 3
		expect(ev.ms).toBeGreaterThanOrEqual(0);
		expect(c.events[0]).toMatchObject({ kind: "insert", rows: 1, bytes: 0, status: 201 });
	});

	it("kinds for update, delete, rpc; HEAD reports 0 bytes; errors carry their code", async () => {
		const c = makeClient(db);
		await c.from("tags").update({ label: "U" }).eq("tag_id", "uni").select("tag_id");
		await c.from("tags").delete().eq("tag_id", "uni");
		await c.rpc("count_models");
		await c.from("labs").select("*", { count: "exact", head: true });
		await c.from("tags").insert({ tag_id: "reasoning", label: "dup" });
		expect(c.events.map((e) => [e.kind, e.rows, e.bytes, e.status, e.error ?? null])).toEqual([
			["update", 1, 18, 200, null],
			["delete", 1, 0, 204, null], // rows = rows affected for a minimal-return mutation
			["rpc", 1, 1, 200, null],
			["select", 3, 0, 200, null],
			["insert", 0, 0, 409, "23505"],
		]);
	});

	it("utf8ByteLength matches TextEncoder, including lone surrogates", () => {
		for (const s of ["", "abc", "é", "€", "😀", "a\ud800b", "\udc00"]) expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
	});
});

describe("abortSignal", () => {
	it("a signal that fires mid-query rejects the request like fetch (AbortSignal.timeout pattern)", async () => {
		// PGlite runs on this thread, so a slow statement is simulated by a slow executor.
		const fast = pgliteExecutor(db);
		const slowExecutor: SqlExecutor = {
			query: (text, params) => new Promise((resolve) => setTimeout(resolve, 400)).then(() => fast.query(text, params)),
			transaction: (fn) => fn(slowExecutor),
		};
		const slowClient = makeClient(db, { sql: slowExecutor });
		const started = Date.now();
		const slow = await slowClient.rpc("count_models").abortSignal(AbortSignal.timeout(50));
		expect(Date.now() - started).toBeLessThan(300);
		expect(slow.data).toBeNull();
		expect(slow.error?.message).toMatch(/TimeoutError|AbortError|aborted|timed out/i);
		expect(slowClient.events.at(-1)?.error).toBe("ABORTED");
	});
});

describe("client surface", () => {
	it("auth / storage throw a clear error", () => {
		expect(() => (client as unknown as { auth: unknown }).auth).toThrow(/not available on the PlanetScale client/);
		expect(() => (client as unknown as { storage: unknown }).storage).toThrow(/not available on the PlanetScale client/);
	});
});
