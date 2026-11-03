import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureDb, makeClient, type TestClient } from "./helpers";

let db: PGlite;
let client: TestClient;

beforeAll(async () => {
	db = await createFixtureDb();
	client = makeClient(db);
});

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;

describe("insert", () => {
	it("without select(): 201, no body (return=minimal)", async () => {
		const res = await client.from("tags").insert({ tag_id: "audio", label: "Audio" });
		expect(res).toMatchObject({ data: null, error: null, status: 201, statusText: "Created" });
		expect(await rows("select label from tags where tag_id = 'audio'")).toEqual([{ label: "Audio" }]);
	});

	it("with select(): returns the inserted rows, defaults filled in", async () => {
		const res = await client.from("events").insert({ kind: "probe", payload: { deep: [1, { x: "y" }] }, labels: ["a", "b,c"] }).select("kind,payload,labels,occurred_at");
		expect(res.status).toBe(201);
		expect(res.data).toEqual([{ kind: "probe", payload: { deep: [1, { x: "y" }] }, labels: ["a", "b,c"], occurred_at: "2026-01-01T00:00:00+00:00" }]);
	});

	it("bulk insert: keys missing from a row become NULL (defaultToNull), like PostgREST's columns=", async () => {
		const res = await client
			.from("events")
			.insert([{ kind: "bulk-1", amount_nanos: 1 }, { kind: "bulk-2", payload: { p: true } }])
			.select("kind,payload,amount_nanos");
		expect(res.data).toEqual([
			{ kind: "bulk-1", payload: null, amount_nanos: 1 },
			{ kind: "bulk-2", payload: { p: true }, amount_nanos: null },
		]);
	});

	it("insert().select().single() returns one object", async () => {
		const res = await client.from("tags").insert({ tag_id: "code", label: "Code" }).select("tag_id").single();
		expect(res).toMatchObject({ data: { tag_id: "code" }, error: null, status: 201 });
	});

	it("with embedded resources in the returned representation", async () => {
		const res = await client.from("models").insert({ model_slug: "le-chat", name: "Le Chat", lab_slug: "mistral" }).select("model_slug,lab:labs(name)").single();
		expect(res.data).toEqual({ model_slug: "le-chat", lab: { name: "Mistral" } });
	});

	it("unique violation keeps the SQLSTATE: 23505 / 409", async () => {
		const res = await client.from("tags").insert({ tag_id: "reasoning", label: "dup" });
		expect(res.status).toBe(409);
		expect(res.error).toEqual({
			code: "23505",
			message: 'duplicate key value violates unique constraint "tags_pkey"',
			details: "Key (tag_id)=(reasoning) already exists.",
			hint: null,
		});
	});

	it("not-null violation: 23502 / 400; FK violation: 23503 / 409", async () => {
		const nn = await client.from("tags").insert({ tag_id: "x-null" });
		expect(nn.status).toBe(400);
		expect(nn.error?.code).toBe("23502");
		const fk = await client.from("models").insert({ model_slug: "orphan", name: "Orphan", lab_slug: "nope" });
		expect(fk.status).toBe(409);
		expect(fk.error?.code).toBe("23503");
	});

	it("invalid input for a column type: 22P02 / 400", async () => {
		const res = await client.from("users").insert({ user_id: "not-a-uuid" });
		expect(res.status).toBe(400);
		expect(res.error?.code).toBe("22P02");
	});

	it("count: 'exact' on insert", async () => {
		const res = await client.from("tags").insert([{ tag_id: "c1", label: "C1" }, { tag_id: "c2", label: "C2" }], { count: "exact" });
		expect(res.count).toBe(2);
		expect(res.status).toBe(201);
	});

	it("empty array inserts nothing", async () => {
		const res = await client.from("tags").insert([]).select();
		expect(res).toMatchObject({ data: [], error: null, status: 201 });
	});
});

describe("upsert", () => {
	it("merge-duplicates on onConflict columns (201 when inserting, 200 when only updating)", async () => {
		const ws = "10000000-0000-0000-0000-000000000001";
		const first = await client.from("settings").upsert({ workspace_id: ws, key: "theme", value: "dark" }, { onConflict: "workspace_id,key" }).select("key,value");
		expect(first).toMatchObject({ data: [{ key: "theme", value: "dark" }], status: 201 });
		const second = await client.from("settings").upsert({ workspace_id: ws, key: "theme", value: "light" }, { onConflict: "workspace_id,key" }).select("key,value");
		expect(second).toMatchObject({ data: [{ key: "theme", value: "light" }], status: 200 });
		expect(await rows("select value from settings where key = 'theme'")).toEqual([{ value: "light" }]);
	});

	it("ignoreDuplicates returns only the rows actually inserted", async () => {
		const res = await client
			.from("tags")
			.upsert([{ tag_id: "reasoning", label: "IGNORED" }, { tag_id: "fresh", label: "Fresh" }], { onConflict: "tag_id", ignoreDuplicates: true })
			.select("tag_id");
		expect(res.data).toEqual([{ tag_id: "fresh" }]);
		expect(await rows("select label from tags where tag_id = 'reasoning'")).toEqual([{ label: "Reasoning" }]);
	});

	it("without onConflict uses the primary key from relationships.json", async () => {
		const res = await client.from("tags").upsert({ tag_id: "vision", label: "Vision 2" }).select("label");
		expect(res.data).toEqual([{ label: "Vision 2" }]);
	});
});

describe("update", () => {
	it("updates filtered rows; 204 without select()", async () => {
		const res = await client.from("models").update({ status: "beta" }).eq("model_slug", "gpt-6-mini");
		expect(res).toMatchObject({ data: null, error: null, status: 204 });
		expect(await rows("select status from models where model_slug = 'gpt-6-mini'")).toEqual([{ status: "beta" }]);
	});

	it("update().select() returns changed rows with 200; jsonb and array values", async () => {
		const res = await client
			.from("models")
			.update({ metadata: { tier: "mini", list: [1, 2] }, input_modalities: ["text", "file"] })
			.eq("model_slug", "gpt-6-mini")
			.select("model_slug,metadata,input_modalities");
		expect(res.status).toBe(200);
		expect(res.data).toEqual([{ model_slug: "gpt-6-mini", metadata: { tier: "mini", list: [1, 2] }, input_modalities: ["text", "file"] }]);
	});

	it("update().select().single() with 0 rows is PGRST116 and rolls back", async () => {
		const res = await client.from("labs").update({ name: "X" }).eq("lab_slug", "nope").select().single();
		expect(res.error?.code).toBe("PGRST116");
		const many = await client.from("labs").update({ name: "Renamed" }).in("lab_slug", ["openai", "mistral"]).select("lab_slug").single();
		expect(many.status).toBe(406);
		expect(many.error?.details).toBe("The result contains 2 rows");
		expect(await rows("select name from labs where lab_slug in ('openai','mistral') order by lab_slug")).toEqual([{ name: "Mistral" }, { name: "OpenAI" }]);
	});

	it("count: 'exact' on update and Content-Range", async () => {
		const res = await client.from("benchmark_results").update({ effective_to: null }, { count: "exact" }).eq("model_slug", "gpt-5");
		expect(res.count).toBe(2);
	});
});

describe("delete", () => {
	it("deletes filtered rows and returns them with select()", async () => {
		await rows("insert into tags values ('tmp1','T1'),('tmp2','T2'),('tmp3','T3')");
		const res = await client.from("tags").delete().like("tag_id", "tmp%").neq("tag_id", "tmp3").select("tag_id");
		expect(res.status).toBe(200);
		expect(res.data).toEqual([{ tag_id: "tmp1" }, { tag_id: "tmp2" }]);
		const res2 = await client.from("tags").delete({ count: "exact" }).eq("tag_id", "tmp3");
		expect(res2).toMatchObject({ status: 204, count: 1, data: null, error: null });
	});
});
