import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureDb, makeClient, type TestClient } from "./helpers";

let db: PGlite;
let client: TestClient;

beforeAll(async () => {
	db = await createFixtureDb();
	client = makeClient(db);
});

/** Raw PostgREST-style response: status, headers and the exact body text. */
async function raw(path: string, init: RequestInit = {}) {
	const fetchFn = (client as unknown as { fetch: typeof fetch }).fetch;
	const res = await fetchFn(`http://phaseo-db.invalid${path}`, init);
	return { status: res.status, range: res.headers.get("content-range"), body: await res.text() };
}

describe("columns", () => {
	it("selects named columns in select order", async () => {
		const { data, error, status } = await client.from("labs").select("name,lab_slug").order("lab_slug");
		expect(error).toBeNull();
		expect(status).toBe(200);
		expect(data).toEqual([
			{ name: "Empty Lab", lab_slug: "empty" },
			{ name: "Mistral", lab_slug: "mistral" },
			{ name: "OpenAI", lab_slug: "openai" },
		]);
		expect(Object.keys(data![0]!)).toEqual(["name", "lab_slug"]);
	});

	it("select() with no columns and * return every column", async () => {
		const a = await client.from("labs").select().eq("lab_slug", "openai");
		const b = await client.from("labs").select("*").eq("lab_slug", "openai");
		expect(a.data).toEqual([{ lab_slug: "openai", name: "OpenAI", country_code: "US", metadata: { colour: "#000" } }]);
		expect(b.data).toEqual(a.data);
	});

	it("aliases columns (alias:col)", async () => {
		const { data } = await client.from("models").select("model_id:model_slug,organisation_id:lab_slug").eq("model_slug", "gpt-5");
		expect(data).toEqual([{ model_id: "gpt-5", organisation_id: "openai" }]);
	});

	it("casts columns (col::text)", async () => {
		const { data } = await client.from("events").select("id::text,amount_nanos::text").eq("kind", "topup");
		expect(data).toEqual([{ id: "3", amount_nanos: "5000000000000" }]);
	});

	it("reads JSON paths with -> and ->> (alias defaults to the last key)", async () => {
		const { data } = await client.from("models").select("model_slug,tier:metadata->>tier,metadata->data_policy,zdr:metadata->data_policy->>zdr").eq("model_slug", "gpt-5");
		expect(data).toEqual([{ model_slug: "gpt-5", tier: "frontier", data_policy: { zdr: true }, zdr: "true" }]);
	});

	it("returns timestamps, arrays, numerics and bigints as PostgREST does", async () => {
		const r = await raw("/models?select=released_at,input_modalities&model_slug=eq.gpt-5");
		expect(r.body).toBe('[{"released_at":"2025-08-07T00:00:00+00:00","input_modalities":["text","image"]}]');
		const n = await raw("/benchmark_results?select=score&result_id=eq.1");
		expect(n.body).toBe('[{"score":91.5}]');
		const big = await raw("/events?select=amount_nanos&kind=eq.topup");
		expect(big.body).toBe('[{"amount_nanos":5000000000000}]');
	});
});

describe("embedded resources", () => {
	it("to-one (many-to-one) embeds an object, as jsonb like PostgREST", async () => {
		const { data } = await client.from("models").select("model_slug,lab:labs(name,country_code)").eq("model_slug", "gpt-5");
		expect(data).toEqual([{ model_slug: "gpt-5", lab: { name: "OpenAI", country_code: "US" } }]);
		const r = await raw("/models?select=model_slug,lab:labs(name,country_code)&model_slug=eq.gpt-5");
		// row_to_json(...)::jsonb: jsonb key order (shorter keys first) and jsonb spacing
		expect(r.body).toBe('[{"model_slug":"gpt-5","lab":{"name": "OpenAI", "country_code": "US"}}]');
	});

	it("to-many (one-to-many) embeds an array, [] when empty", async () => {
		const { data } = await client.from("labs").select("lab_slug,models(model_slug)").order("lab_slug").order("model_slug", { referencedTable: "models" });
		expect(data).toEqual([
			{ lab_slug: "empty", models: [] },
			{ lab_slug: "mistral", models: [{ model_slug: "mistral-large" }] },
			{ lab_slug: "openai", models: [{ model_slug: "gpt-5" }, { model_slug: "gpt-6" }, { model_slug: "gpt-6-mini" }] },
		]);
	});

	it("one-to-one from the referenced side embeds an object or null", async () => {
		const { data } = await client.from("models").select("model_slug,model_details(notes)").in("model_slug", ["gpt-5", "gpt-6"]).order("model_slug");
		expect(data).toEqual([
			{ model_slug: "gpt-5", model_details: { notes: "flagship" } },
			{ model_slug: "gpt-6", model_details: null },
		]);
	});

	it("many-to-many through a junction table", async () => {
		const { data } = await client.from("models").select("model_slug,tags(tag_id,label)").in("model_slug", ["gpt-5", "gpt-6-mini"]).order("model_slug").order("tag_id", { referencedTable: "tags" });
		expect(data).toEqual([
			{ model_slug: "gpt-5", tags: [{ tag_id: "reasoning", label: "Reasoning" }, { tag_id: "vision", label: "Vision" }] },
			{ model_slug: "gpt-6-mini", tags: [] },
		]);
	});

	it("self-reference: column-as-target is the parent (M2O), table name is the children (O2M)", async () => {
		const parent = await client.from("models").select("model_slug,previous:previous_model_slug(model_slug,name)").eq("model_slug", "gpt-6");
		expect(parent.data).toEqual([{ model_slug: "gpt-6", previous: { model_slug: "gpt-5", name: "GPT-5" } }]);
		const children = await client.from("models").select("model_slug,successors:models(model_slug)").eq("model_slug", "gpt-5");
		expect(children.data).toEqual([{ model_slug: "gpt-5", successors: [{ model_slug: "gpt-6" }] }]);
		const hinted = await client.from("models").select("model_slug,successors:models!previous_model_slug(model_slug)").eq("model_slug", "gpt-5");
		expect(hinted.data).toEqual(children.data);
	});

	it("two FKs to the same table need a !hint; without one it is PGRST201 (300)", async () => {
		const { data } = await client
			.from("workspace_join_requests")
			.select("id,requester:users!workspace_join_requests_requester_user_id_fkey(display_name),decider:users!decided_by(display_name)")
			.order("created_at");
		expect(data).toEqual([
			{ id: "20000000-0000-0000-0000-000000000001", requester: { display_name: "Linus" }, decider: { display_name: "Ada" } },
			{ id: "20000000-0000-0000-0000-000000000002", requester: { display_name: "Linus" }, decider: null },
		]);
		const ambiguous = await client.from("workspace_join_requests").select("id,users(display_name)");
		expect(ambiguous.status).toBe(300);
		expect(ambiguous.error?.code).toBe("PGRST201");
		expect(ambiguous.error?.message).toBe("Could not embed because more than one relationship was found for 'workspace_join_requests' and 'users'");
		expect(ambiguous.error?.hint).toBe(
			"Try changing 'users' to one of the following: 'users!workspace_join_requests_decided_by_fkey', 'users!workspace_join_requests_requester_user_id_fkey'. Find the desired relationship in the 'details' key.",
		);
	});

	it("unknown relationship is PGRST200 (400)", async () => {
		const res = await client.from("labs").select("lab_slug,benchmarks(name)");
		expect(res.status).toBe(400);
		expect(res.error).toEqual({
			code: "PGRST200",
			message: "Could not find a relationship between 'labs' and 'benchmarks' in the schema cache",
			details: "Searched for a foreign key relationship between 'labs' and 'benchmarks' in the schema 'public', but no matches were found.",
			hint: null,
		});
	});

	it("!inner drops parents without a matching embedded row", async () => {
		const { data } = await client.from("labs").select("lab_slug,models!inner(model_slug)").eq("models.status", "deprecated");
		expect(data).toEqual([{ lab_slug: "openai", models: [{ model_slug: "gpt-6-mini" }] }]);
		const counted = await client.from("labs").select("lab_slug,models!inner(model_slug)", { count: "exact", head: true }).eq("models.hidden", true);
		expect(counted.count).toBe(1);
	});

	it("filters on an embedded column filter the embedded rows only (without !inner)", async () => {
		const { data } = await client.from("labs").select("lab_slug,models(model_slug)").eq("models.status", "deprecated").order("lab_slug");
		expect(data).toEqual([
			{ lab_slug: "empty", models: [] },
			{ lab_slug: "mistral", models: [] },
			{ lab_slug: "openai", models: [{ model_slug: "gpt-6-mini" }] },
		]);
	});

	it("nested embeds, with embedded order/limit and is.null embed filters", async () => {
		const { data } = await client
			.from("labs")
			.select("lab_slug,models(model_slug,results:benchmark_results(score))")
			.eq("lab_slug", "openai")
			.order("model_slug", { referencedTable: "models" })
			.limit(2, { referencedTable: "models" })
			.order("score", { referencedTable: "models.results", ascending: false });
		expect(data).toEqual([
			{
				lab_slug: "openai",
				models: [
					{ model_slug: "gpt-5", results: [{ score: 91.5 }, { score: 80.1 }] },
					{ model_slug: "gpt-6", results: [{ score: 94.2 }] },
				],
			},
		]);
		const withDetails = await client.from("models").select("model_slug,model_details(notes)").not("model_details", "is", null);
		expect(withDetails.data).toEqual([{ model_slug: "gpt-5", model_details: { notes: "flagship" } }]);
		const withoutDetails = await client.from("models").select("model_slug,model_details(notes)").is("model_details", null).order("model_slug");
		expect(withoutDetails.data?.map((r) => r.model_slug)).toEqual(["gpt-6", "gpt-6-mini", "mistral-large"]);
	});

	it("filtering an embed that is not selected is PGRST108", async () => {
		const res = await client.from("labs").select("lab_slug").eq("models.status", "active");
		expect(res.error).toMatchObject({ code: "PGRST108", message: "'models' is not an embedded resource in this request" });
	});
});

describe("filters", () => {
	const slugs = async (q: PromiseLike<{ data: Array<{ model_slug: string }> | null; error: unknown }>) => {
		const r = await q;
		expect(r.error).toBeNull();
		return r.data!.map((x) => x.model_slug);
	};
	const models = () => client.from("models").select("model_slug").order("model_slug");

	it("eq / neq / gt / gte / lt / lte", async () => {
		expect(await slugs(models().eq("lab_slug", "openai"))).toEqual(["gpt-5", "gpt-6", "gpt-6-mini"]);
		expect(await slugs(models().neq("lab_slug", "openai"))).toEqual(["mistral-large"]);
		expect(await slugs(models().gt("released_at", "2026-01-01T00:00:00Z"))).toEqual(["gpt-6", "mistral-large"]);
		expect(await slugs(models().gte("released_at", "2026-06-01T00:00:00Z"))).toEqual(["gpt-6"]);
		expect(await slugs(models().lt("released_at", "2026-01-01T00:00:00Z"))).toEqual(["gpt-5"]);
		expect(await slugs(models().lte("released_at", "2026-02-01T00:00:00Z"))).toEqual(["gpt-5", "mistral-large"]);
	});

	it("eq coerces text to the column type (boolean, number)", async () => {
		expect(await slugs(models().eq("hidden", true))).toEqual(["mistral-large"]);
		const r = await client.from("benchmark_results").select("result_id").gt("score", 90).order("result_id");
		expect(r.data).toEqual([{ result_id: 1 }, { result_id: 3 }]);
	});

	it("like / ilike (with * or %)", async () => {
		expect(await slugs(models().like("model_slug", "gpt-6%"))).toEqual(["gpt-6", "gpt-6-mini"]);
		expect(await slugs(models().like("model_slug", "*mini"))).toEqual(["gpt-6-mini"]);
		expect(await slugs(models().ilike("name", "MISTRAL%"))).toEqual(["mistral-large"]);
	});

	it("is null / true / false and not.is.null", async () => {
		expect(await slugs(models().is("released_at", null))).toEqual(["gpt-6-mini"]);
		expect(await slugs(models().is("hidden", false))).toEqual(["gpt-5", "gpt-6", "gpt-6-mini"]);
		expect(await slugs(models().not("previous_model_slug", "is", null))).toEqual(["gpt-6"]);
	});

	it("in, including values with reserved characters, and not.in", async () => {
		expect(await slugs(models().in("model_slug", ["gpt-5", "mistral-large", "nope,(x)"]))).toEqual(["gpt-5", "mistral-large"]);
		expect(await slugs(models().in("model_slug", []))).toEqual([]);
		expect(await slugs(models().not("status", "in", "(active)"))).toEqual(["gpt-6-mini"]);
		const ints = await client.from("benchmark_results").select("result_id").in("result_id", [1, 3, 99]).order("result_id");
		expect(ints.data).toEqual([{ result_id: 1 }, { result_id: 3 }]);
		const uuids = await client.from("users").select("display_name").in("user_id", ["00000000-0000-0000-0000-000000000002"]);
		expect(uuids.data).toEqual([{ display_name: "Grace" }]);
	});

	it("contains / containedBy / overlaps on arrays and jsonb", async () => {
		expect(await slugs(models().contains("input_modalities", ["image"]))).toEqual(["gpt-5", "gpt-6"]);
		expect(await slugs(models().containedBy("input_modalities", ["text", "image"]))).toEqual(["gpt-5", "gpt-6-mini", "mistral-large"]);
		expect(await slugs(models().overlaps("input_modalities", ["audio", "x"]))).toEqual(["gpt-6"]);
		expect(await slugs(models().contains("metadata", { previous_model_id: "gpt-5" }))).toEqual(["gpt-6"]);
	});

	it("match() and filter()", async () => {
		expect(await slugs(models().match({ lab_slug: "openai", status: "deprecated" }))).toEqual(["gpt-6-mini"]);
		expect(await slugs(models().filter("status", "eq", "deprecated"))).toEqual(["gpt-6-mini"]);
		expect(await slugs(models().filter("model_slug", "in", "(gpt-5,gpt-6)"))).toEqual(["gpt-5", "gpt-6"]);
	});

	it("textSearch variants", async () => {
		expect(await slugs(models().textSearch("name", "mistral"))).toEqual(["mistral-large"]);
		expect(await slugs(models().textSearch("name", "gpt & mini", { config: "simple" }))).toEqual(["gpt-6-mini"]);
		expect(await slugs(models().textSearch("name", "large mistral", { type: "plain" }))).toEqual(["mistral-large"]);
		expect(await slugs(models().textSearch("name", "mistral large", { type: "phrase" }))).toEqual(["mistral-large"]);
		expect(await slugs(models().textSearch("name", "large mistral", { type: "phrase" }))).toEqual([]);
		expect(await slugs(models().textSearch("name", "gpt -mini", { type: "websearch", config: "simple" }))).toEqual(["gpt-5", "gpt-6"]);
	});

	it("filters on JSON paths", async () => {
		expect(await slugs(models().eq("metadata->>tier", "frontier"))).toEqual(["gpt-5", "gpt-6"]);
		expect(await slugs(models().not("metadata->data_policy", "is", null))).toEqual(["gpt-5"]);
	});

	it("or() with nested and(), quoted values and not.", async () => {
		expect(await slugs(models().or("status.eq.deprecated,and(lab_slug.eq.mistral,hidden.is.true)"))).toEqual(["gpt-6-mini", "mistral-large"]);
		expect(await slugs(models().or(`model_slug.eq.${JSON.stringify("gpt-5")},name.eq."GPT-6"`))).toEqual(["gpt-5", "gpt-6"]);
		expect(await slugs(models().or("model_slug.in.(gpt-5,gpt-6),status.not.eq.active"))).toEqual(["gpt-5", "gpt-6", "gpt-6-mini"]);
		const r = await raw("/models?select=model_slug&order=model_slug&not.or=(lab_slug.eq.openai,status.eq.deprecated)");
		expect(JSON.parse(r.body)).toEqual([{ model_slug: "mistral-large" }]);
		const nested = await raw("/models?select=model_slug&order=model_slug&or=(not.and(lab_slug.eq.openai,status.eq.active),hidden.is.true)");
		expect(JSON.parse(nested.body)).toEqual([{ model_slug: "gpt-6-mini" }, { model_slug: "mistral-large" }]);
	});

	it("or() on an embedded resource (referencedTable)", async () => {
		const { data } = await client
			.from("benchmarks")
			.select("benchmark_id,results:benchmark_results(result_id)")
			.eq("benchmark_id", "mmlu")
			.or("effective_to.is.null,effective_to.gt.2026-11-01T00:00:00Z", { referencedTable: "results" })
			.order("result_id", { referencedTable: "results" });
		expect(data).toEqual([{ benchmark_id: "mmlu", results: [{ result_id: 1 }, { result_id: 3 }, { result_id: 4 }] }]);
	});
});

describe("modifiers", () => {
	it("order: desc, nullsFirst / nullsLast, multiple columns", async () => {
		const a = await client.from("models").select("model_slug").order("released_at", { ascending: false, nullsFirst: false });
		expect(a.data!.map((r) => r.model_slug)).toEqual(["gpt-6", "mistral-large", "gpt-5", "gpt-6-mini"]);
		const b = await client.from("models").select("model_slug").order("released_at", { ascending: true, nullsFirst: true });
		expect(b.data!.map((r) => r.model_slug)).toEqual(["gpt-6-mini", "gpt-5", "mistral-large", "gpt-6"]);
		const c = await client.from("models").select("model_slug").order("lab_slug", { ascending: false }).order("model_slug", { ascending: false });
		expect(c.data!.map((r) => r.model_slug)).toEqual(["gpt-6-mini", "gpt-6", "gpt-5", "mistral-large"]);
	});

	it("limit and range", async () => {
		const a = await client.from("models").select("model_slug").order("model_slug").limit(2);
		expect(a.data!.map((r) => r.model_slug)).toEqual(["gpt-5", "gpt-6"]);
		const b = await client.from("models").select("model_slug").order("model_slug").range(1, 2);
		expect(b.data!.map((r) => r.model_slug)).toEqual(["gpt-6", "gpt-6-mini"]);
	});

	it("single(): one row as an object; 0 or 2+ rows is PGRST116 (406)", async () => {
		const one = await client.from("labs").select("name").eq("lab_slug", "openai").single();
		expect(one).toMatchObject({ data: { name: "OpenAI" }, error: null, status: 200 });
		const none = await client.from("labs").select("name").eq("lab_slug", "nope").single();
		expect(none.status).toBe(406);
		expect(none.error).toEqual({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null });
		const many = await client.from("labs").select("name").single();
		expect(many.error).toMatchObject({ code: "PGRST116", details: "The result contains 3 rows" });
	});

	it("maybeSingle(): object, null for no rows, PGRST116 for several", async () => {
		const one = await client.from("labs").select("name").eq("lab_slug", "openai").maybeSingle();
		expect(one).toMatchObject({ data: { name: "OpenAI" }, error: null });
		const none = await client.from("labs").select("name").eq("lab_slug", "nope").maybeSingle();
		expect(none).toMatchObject({ data: null, error: null, status: 200 });
		const many = await client.from("labs").select("name").maybeSingle();
		expect(many.error?.code).toBe("PGRST116");
	});

	it("count: 'exact' with Content-Range and 206 for a partial page", async () => {
		const res = await client.from("models").select("model_slug", { count: "exact" }).order("model_slug").range(0, 1);
		expect(res.count).toBe(4);
		expect(res.status).toBe(206);
		const r = await raw("/models?select=model_slug&order=model_slug&offset=1&limit=2", { headers: { Prefer: "count=exact" } });
		expect(r.range).toBe("1-2/4");
		const full = await raw("/models?select=model_slug", { headers: { Prefer: "count=exact" } });
		expect(full.status).toBe(200);
		expect(full.range).toBe("0-3/4");
		const empty = await raw("/models?select=model_slug&model_slug=eq.none", { headers: { Prefer: "count=exact" } });
		expect(empty.range).toBe("*/0");
		const noCount = await raw("/models?select=model_slug&limit=1");
		expect(noCount.range).toBe("0-0/*");
	});

	it("head: true returns only the count", async () => {
		const res = await client.from("models").select("*", { count: "exact", head: true }).eq("hidden", false);
		expect(res).toMatchObject({ data: null, error: null, count: 3, status: 200 });
	});

	it("offset past the end with a count is PGRST103 (416)", async () => {
		const res = await client.from("models").select("model_slug", { count: "exact" }).range(10, 12);
		expect(res.status).toBe(416);
		expect(res.error).toMatchObject({ code: "PGRST103", details: "An offset of 10 was requested, but there are only 4 rows." });
	});

	it("max-rows caps the root and embedded arrays (PostgREST db-max-rows)", async () => {
		const capped = makeClient(db, { maxRows: 2 });
		const res = await capped.from("labs").select("lab_slug,models(model_slug)", { count: "exact" }).order("lab_slug", { ascending: false });
		expect(res.data).toHaveLength(2);
		expect(res.data![0]!.models).toHaveLength(2);
		expect(res.count).toBe(3);
		expect(res.status).toBe(206);
	});

	it("stripNulls()", async () => {
		const { data } = await client.from("labs").select("lab_slug,country_code").eq("lab_slug", "empty").stripNulls();
		expect(data).toEqual([{ lab_slug: "empty" }]);
	});

	it("schema(): unknown profiles are PGRST106 (406)", async () => {
		const res = await client.schema("private" as never).from("x").select("*");
		expect(res.status).toBe(406);
		expect(res.error).toMatchObject({ code: "PGRST106", message: "The schema must be one of the following: public" });
	});
});
