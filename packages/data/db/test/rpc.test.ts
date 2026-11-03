import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureDb, makeClient, type TestClient } from "./helpers";

let db: PGlite;
let client: TestClient;

beforeAll(async () => {
	db = await createFixtureDb();
	client = makeClient(db);
});

async function raw(path: string, init: RequestInit = {}) {
	const fetchFn = (client as unknown as { fetch: typeof fetch }).fetch;
	const res = await fetchFn(`http://phaseo-db.invalid${path}`, init);
	return { status: res.status, range: res.headers.get("content-range"), body: await res.text() };
}

describe("rpc", () => {
	it("set-returning function of a table type: array of rows", async () => {
		const { data, error, status } = await client.rpc("get_lab_models", { p_lab: "mistral" });
		expect(error).toBeNull();
		expect(status).toBe(200);
		expect(data).toEqual([
			{
				model_slug: "mistral-large",
				name: "Mistral Large",
				lab_slug: "mistral",
				previous_model_slug: null,
				status: "active",
				hidden: true,
				released_at: "2026-02-01T00:00:00+00:00",
				input_modalities: ["text"],
				metadata: { tier: "open" },
				created_at: "2026-01-01T00:00:00+00:00",
			},
		]);
	});

	it("filters, select, order, limit and embeds apply to the result", async () => {
		const { data } = await client
			.rpc("get_lab_models", { p_lab: "openai" })
			.select("model_slug,lab:labs(name)")
			.neq("status", "deprecated")
			.order("model_slug", { ascending: false })
			.limit(1);
		expect(data).toEqual([{ model_slug: "gpt-6", lab: { name: "OpenAI" } }]);
	});

	it("count and head on a set-returning function", async () => {
		const res = await client.rpc("get_lab_models", { p_lab: "openai" }, { count: "exact", head: true });
		expect(res).toMatchObject({ data: null, error: null, count: 3 });
		const counted = await client.rpc("get_lab_models", { p_lab: "openai" }, { count: "exact" }).range(0, 0);
		expect(counted.count).toBe(3);
		expect(counted.status).toBe(206);
	});

	it("scalar result is the bare JSON value", async () => {
		const r = await raw("/rpc/count_models", { method: "POST", body: JSON.stringify({ p_lab: "openai" }) });
		expect(r.body).toBe("3");
		const res = await client.rpc("count_models");
		expect(res.data).toBe(4); // default argument
	});

	it("set of scalars is an array of values", async () => {
		const res = await client.rpc("model_names");
		expect(res.data).toEqual(["gpt-5", "gpt-6", "gpt-6-mini", "mistral-large"]);
	});

	it("jsonb in, jsonb out; array arguments", async () => {
		const payload = { a: [1, "two", { three: null }], big: 12345678901234 };
		expect((await client.rpc("echo_json", { p: payload })).data).toEqual(payload);
		expect((await client.rpc("sum_array", { p_values: [1, 2, 39] })).data).toBe(42);
	});

	it("void function: 204, data null", async () => {
		const res = await client.rpc("touch_models", { p_slugs: ["gpt-5"] });
		expect(res).toMatchObject({ data: null, error: null, status: 204 });
		expect((await db.query("select status from models where model_slug = 'gpt-5'")).rows).toEqual([{ status: "touched" }]);
	});

	it("RETURNS TABLE: array of objects", async () => {
		const res = await client.rpc("lab_summary", { p_lab: "openai" });
		expect(res.data).toEqual([{ lab_slug: "openai", model_count: 3 }]);
	});

	it("single composite: one object; .single()/.maybeSingle() work", async () => {
		expect((await client.rpc("single_lab", { p_lab: "mistral" })).data).toEqual({ lab_slug: "mistral", name: "Mistral", country_code: "FR", metadata: { colour: "#f70" } });
		const maybe = await client.rpc("get_lab_models", { p_lab: "mistral" }).select("model_slug").maybeSingle();
		expect(maybe.data).toEqual({ model_slug: "mistral-large" });
		const none = await client.rpc("get_lab_models", { p_lab: "nobody" }).maybeSingle();
		expect(none).toMatchObject({ data: null, error: null });
	});

	it("volatile composite (claim pattern) returns the updated row", async () => {
		const res = await client.rpc("claim_next_event", { p_kind: "charge" }).select("kind");
		expect(res.data).toEqual({ kind: "charge:claimed" });
	});

	it("resolves overloads by argument names", async () => {
		expect((await client.rpc("overloaded", { a: 1 })).data).toBe("int");
		expect((await client.rpc("overloaded", { a: "x", b: "y" })).data).toBe("text,text");
	});

	it("unknown function or arguments: PGRST202 (404)", async () => {
		const res = await client.rpc("nope", { x: 1 });
		expect(res.status).toBe(404);
		expect(res.error).toMatchObject({ code: "PGRST202", message: "Could not find the function public.nope(x) in the schema cache" });
		const badArgs = await client.rpc("count_models", { p_wrong: 1 });
		expect(badArgs.error?.code).toBe("PGRST202");
	});

	it("errors raised in functions keep SQLSTATE, message, detail and hint", async () => {
		const res = await client.rpc("fail_with", { p_code: "P0001" });
		expect(res.status).toBe(400);
		expect(res.error).toEqual({ code: "P0001", message: "failed on purpose", details: "some detail", hint: "some hint" });
		const forbidden = await client.rpc("fail_with", { p_code: "42501" });
		expect(forbidden.status).toBe(401); // service_role is not "authenticated" in PostgREST's sense
		const custom = await client.rpc("fail_with", { p_code: "PT402" });
		expect(custom.status).toBe(402);
	});

	it("GET rpc (get: true): arguments from the query string, the rest are filters", async () => {
		const res = await client.rpc("get_lab_models", { p_lab: "openai" }, { get: true }).select("model_slug").eq("status", "deprecated");
		expect(res.data).toEqual([{ model_slug: "gpt-6-mini" }]);
	});

	it("whoami reads request.jwt.claims", async () => {
		const user = makeClient(db, { role: "service_role", serviceRoleClaims: "always", claims: { sub: "00000000-0000-0000-0000-000000000009" } });
		expect((await user.rpc("whoami")).data).toBe("00000000-0000-0000-0000-000000000009");
	});
});
