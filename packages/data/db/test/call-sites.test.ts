/**
 * Query shapes copied from real call sites (file:line in each test name).
 * Table and column names follow the fixture schema; the builder chain is the
 * one the app sends.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureDb, makeClient, type TestClient } from "./helpers";

let db: PGlite;
let client: TestClient;
const NOW = "2026-11-03T00:00:00.000Z";
const ACME = "10000000-0000-0000-0000-000000000001";
const ADA = "00000000-0000-0000-0000-000000000001";

beforeAll(async () => {
	db = await createFixtureDb();
	client = makeClient(db);
});

describe("real call-site shapes", () => {
	it("apps/api/src/pipeline/pricing/loader.ts:78 — nested embeds, embedded filters, referencedTable or/order", async () => {
		const provider = "openai";
		const endpoint = "text.generate";
		const model = "gpt-6";
		let query = client
			.from("v2_model_provider_routes")
			.select("provider_model_id,skus:v2_pricing_skus(sku_id,provider_model_id,operation,status,currency,effective_from,effective_to,meters:v2_pricing_sku_meters(sku_meter_id,sku_id,meter_key,price_nanos,meter_order))")
			.eq("provider_slug", provider)
			.in("status", ["active", "degraded"])
			.eq("skus.operation", endpoint)
			.eq("skus.status", "active")
			.eq("skus.currency", "USD")
			.lte("skus.effective_from", NOW)
			.or(`effective_to.is.null,effective_to.gt.${NOW}`, { referencedTable: "skus" })
			.eq("skus.meters.billable", true)
			.order("effective_from", { referencedTable: "skus", ascending: false })
			.order("meter_order", { referencedTable: "skus.meters", ascending: true });
		query = query.eq("routing_enabled", true);
		query = query.or(`model_slug.eq.${JSON.stringify(model)},provider_model_slug.eq.${JSON.stringify(model)}`);
		const { data, error } = await query;
		expect(error).toBeNull();
		expect(data).toEqual([
			{
				provider_model_id: "openai:gpt-6",
				skus: [
					{
						sku_id: "sku-live",
						provider_model_id: "openai:gpt-6",
						operation: "text.generate",
						status: "active",
						currency: "USD",
						effective_from: "2026-01-01T00:00:00+00:00",
						effective_to: null,
						meters: [
							{ sku_meter_id: "m-in", sku_id: "sku-live", meter_key: "input_tokens", price_nanos: 2000, meter_order: 1 },
							{ sku_meter_id: "m-out", sku_id: "sku-live", meter_key: "output_tokens", price_nanos: 8000, meter_order: 2 },
						],
					},
				],
			},
		]);
	});

	it("apps/web-api/src/routes/public/landing.ts:48 — count exact + head + or()", async () => {
		const res = await client.from("benchmark_results").select("*", { count: "exact", head: true }).or(`effective_to.is.null,effective_to.gt.${NOW}`);
		expect(res).toMatchObject({ data: null, error: null, count: 3 });
	});

	it("apps/web-api/src/routes/public/landing.ts:50 — rpc with named args", async () => {
		const res = await client.rpc("lab_summary", { p_lab: "mistral" });
		expect(res.data).toEqual([{ lab_slug: "mistral", model_count: 1 }]);
	});

	it("apps/web-api/src/routes/account/settings-teams.ts:144 — aliased embed + two !fkey hints to users", async () => {
		const { data, error } = await client
			.from("workspace_join_requests")
			.select("id,workspace_id,requester_user_id,status,created_at,teams:workspaces(name),requester:users!workspace_join_requests_requester_user_id_fkey(user_id,display_name),decider:users!workspace_join_requests_decided_by_fkey(user_id,display_name)")
			.in("workspace_id", [ACME])
			.or(`status.eq.pending,created_at.gte.2026-10-01T00:00:00Z`);
		expect(error).toBeNull();
		expect(data).toEqual([
			{
				id: "20000000-0000-0000-0000-000000000001",
				workspace_id: ACME,
				requester_user_id: "00000000-0000-0000-0000-000000000003",
				status: "approved",
				created_at: "2026-10-03T00:00:00+00:00",
				teams: { name: "Acme" },
				requester: { user_id: "00000000-0000-0000-0000-000000000003", display_name: "Linus" },
				decider: { user_id: ADA, display_name: "Ada" },
			},
		]);
	});

	it("apps/web-api/src/routes/account/auth.ts:385 — workspaces!inner + maybeSingle", async () => {
		const res = await client.from("workspace_members").select("workspace_id,last_accessed_at,workspaces:workspaces!inner(id,name)").eq("user_id", ADA).eq("workspace_id", ACME).maybeSingle();
		expect(res.data).toEqual({ workspace_id: ACME, last_accessed_at: "2026-10-01T00:00:00+00:00", workspaces: { id: ACME, name: "Acme" } });
		const none = await client.from("workspace_members").select("workspace_id,last_accessed_at,workspaces:workspaces!inner(id,name)").eq("user_id", ADA).eq("workspace_id", "10000000-0000-0000-0000-000000000002").maybeSingle();
		expect(none).toMatchObject({ data: null, error: null });
	});

	it("apps/web-api/src/routes/account/settings.ts:1011 — *, FK-column embed users:user_id(...), is null, order nullsLast, limit", async () => {
		const { data } = await client
			.from("oauth_authorizations")
			.select("*,users:user_id(user_id,display_name,email),teams:workspaces(id,name)")
			.eq("client_id", "cli")
			.is("revoked_at", null)
			.order("last_used_at", { ascending: false, nullsFirst: false })
			.limit(10);
		expect(data).toEqual([
			{
				id: "30000000-0000-0000-0000-000000000001",
				client_id: "cli",
				user_id: ADA,
				workspace_id: ACME,
				revoked_at: null,
				last_used_at: "2026-10-02T00:00:00+00:00",
				users: { user_id: ADA, display_name: "Ada", email: "ada@example.com" },
				teams: { id: ACME, name: "Acme" },
			},
			{
				id: "30000000-0000-0000-0000-000000000002",
				client_id: "cli",
				user_id: "00000000-0000-0000-0000-000000000002",
				workspace_id: null,
				revoked_at: null,
				last_used_at: null,
				users: { user_id: "00000000-0000-0000-0000-000000000002", display_name: "Grace", email: "grace@example.com" },
				teams: null,
			},
		]);
	});

	it("apps/web-api/src/routes/public/compare.ts:140 — lab:labs!models_lab_slug_fkey(...) + in + eq", async () => {
		const { data } = await client.from("models").select("model_slug,name,lab_slug,status,previous_model_slug,released_at,input_modalities,metadata,lab:labs!models_lab_slug_fkey(lab_slug,name,country_code,metadata)").in("model_slug", ["gpt-6", "mistral-large"]).eq("hidden", false);
		expect(data).toEqual([
			{
				model_slug: "gpt-6",
				name: "GPT-6",
				lab_slug: "openai",
				status: "active",
				previous_model_slug: "gpt-5",
				released_at: "2026-06-01T00:00:00+00:00",
				input_modalities: ["text", "image", "audio"],
				metadata: { tier: "frontier", previous_model_id: "gpt-5" },
				lab: { lab_slug: "openai", name: "OpenAI", country_code: "US", metadata: { colour: "#000" } },
			},
		]);
	});

	it("apps/web-api/src/routes/public/compare.ts:144 — benchmark:benchmarks!benchmark_results_benchmark_id_fkey + or + in", async () => {
		const { data } = await client
			.from("benchmark_results")
			.select("result_id,model_slug,benchmark_id,score,benchmark:benchmarks!benchmark_results_benchmark_id_fkey(benchmark_id,name)")
			.or(`effective_to.is.null,effective_to.gt.${NOW}`)
			.in("model_slug", ["gpt-5", "mistral-large"])
			.order("result_id");
		expect(data).toEqual([
			{ result_id: 1, model_slug: "gpt-5", benchmark_id: "mmlu", score: 91.5, benchmark: { benchmark_id: "mmlu", name: "MMLU" } },
			{ result_id: 4, model_slug: "mistral-large", benchmark_id: "mmlu", score: 85, benchmark: { benchmark_id: "mmlu", name: "MMLU" } },
		]);
	});

	it("apps/api/src/providers/index.ts:162 — or() of four and() groups, column aliases", async () => {
		await db.exec("alter table v2_model_provider_routes add column effective_from timestamptz, add column effective_to timestamptz");
		const nowISO = NOW;
		const { data } = await client
			.from("v2_model_provider_routes")
			.select("provider_api_model_id:provider_model_id, provider_id:provider_slug, effective_from, effective_to".replace(/\s/g, ""))
			.eq("model_slug", "gpt-6")
			.eq("routing_enabled", true)
			.in("status", ["active", "degraded"])
			.or(
				[
					"and(effective_from.is.null,effective_to.is.null)",
					`and(effective_from.is.null,effective_to.gt.${nowISO})`,
					`and(effective_from.lte.${nowISO},effective_to.is.null)`,
					`and(effective_from.lte.${nowISO},effective_to.gt.${nowISO})`,
				].join(","),
			);
		expect(data).toEqual([{ provider_api_model_id: "openai:gpt-6", provider_id: "openai", effective_from: null, effective_to: null }]);
	});

	it("apps/web-api/src/routes/account/settings-policy.ts:74 — or() with a JSON path not.is.null and an in.() list with dots", async () => {
		const { data } = await client
			.from("models")
			.select("model_slug,status")
			.in("lab_slug", ["openai", "mistral"])
			.or("metadata->data_policy.not.is.null,model_slug.in.(mistral-large,files.upload,files.list)")
			.in("status", ["active", "touched"])
			.order("model_slug");
		expect(data).toEqual([
			{ model_slug: "gpt-5", status: "active" },
			{ model_slug: "mistral-large", status: "active" },
		]);
	});

	it("apps/web-api/src/routes/account/settings.ts:1320 — or() with is.null, not.in.(), eq", async () => {
		const { data } = await client.from("events").select("kind").or("kind.is.null,kind.not.in.(charge,usage),labels.cs.{x}").order("id");
		expect(data).toEqual([{ kind: "charge" }, { kind: "topup" }]);
	});

	it("apps/web-api/src/routes/account/settings-usage.ts:476 — not like, gte/lte window, in, order desc, limit", async () => {
		const { data } = await client
			.from("gateway_requests")
			.select("request_id,created_at,cost_nanos")
			.eq("workspace_id", ACME)
			.not("request_id", "like", "req-2%")
			.gte("created_at", "2026-10-01T00:00:00Z")
			.lte("created_at", "2026-10-02T00:00:00Z")
			.order("created_at", { ascending: false })
			.limit(50);
		expect(data).toEqual([{ request_id: "req-1", created_at: "2026-10-01T10:00:00+00:00", cost_nanos: 120 }]);
	});

	it("apps/api/src/routes/auth.helpers.ts:212 — contains(array) + limit", async () => {
		const { data } = await client.from("models").select("model_slug, name, status".replace(/\s/g, "")).eq("status", "active").contains("input_modalities", ["audio"]).limit(2);
		expect(data).toEqual([{ model_slug: "gpt-6", name: "GPT-6", status: "active" }]);
	});

	it("apps/web-api/src/routes/account/models.ts:652 — contains(jsonb object) + order", async () => {
		const { data } = await client.from("models").select("model_slug,name,status").contains("metadata", { previous_model_id: "gpt-5" }).order("model_slug");
		expect(data).toEqual([{ model_slug: "gpt-6", name: "GPT-6", status: "active" }]);
	});

	it("apps/web-api/src/routes/public/reference-data.ts:226 — to-many embed with referencedTable or()", async () => {
		const { data } = await client
			.from("benchmarks")
			.select("benchmark_id,results:benchmark_results(result_id,model_slug,score)")
			.in("benchmark_id", ["mmlu", "gpqa"])
			.or(`effective_to.is.null,effective_to.gt.${NOW}`, { referencedTable: "results" })
			.order("benchmark_id")
			.order("result_id", { referencedTable: "results" });
		expect(data).toEqual([
			{ benchmark_id: "gpqa", results: [] },
			{
				benchmark_id: "mmlu",
				results: [
					{ result_id: 1, model_slug: "gpt-5", score: 91.5 },
					{ result_id: 3, model_slug: "gpt-6", score: 94.2 },
					{ result_id: 4, model_slug: "mistral-large", score: 85 },
				],
			},
		]);
	});

	it("apps/web-api/src/usage/actions.ts:848 — JSON-path aliases and an FK-hinted embed in a multi-line select", async () => {
		const { data } = await client
			.from("gateway_requests")
			.select(`
				request_id,created_at,
				app:api_apps!gateway_requests_app_id_fkey(id,app_key,title),
				response_timeline:detail_metadata->response_timeline,
				labels:detail_metadata->labels,
				env:detail_metadata->labels->>env,
				cost_nanos
			`)
			.eq("workspace_id", ACME)
			.order("created_at", { ascending: true });
		expect(data).toEqual([
			{
				request_id: "req-1",
				created_at: "2026-10-01T10:00:00+00:00",
				app: { id: "40000000-0000-0000-0000-000000000001", app_key: "factory", title: "Phaseo Factory" },
				response_timeline: [{ t: 1 }],
				labels: { env: "prod" },
				env: "prod",
				cost_nanos: 120,
			},
			{ request_id: "req-2", created_at: "2026-10-01T11:00:00+00:00", app: null, response_timeline: null, labels: null, env: null, cost_nanos: 80 },
		]);
	});

	it("apps/web-api/src/scim/groups.ts:64 — rpc(...).select(cols).maybeSingle()", async () => {
		const res = await client.rpc("get_lab_models", { p_lab: "mistral" }).select("model_slug,name,status").maybeSingle();
		expect(res).toMatchObject({ data: { model_slug: "mistral-large", name: "Mistral Large", status: "active" }, error: null });
	});

	it("apps/api/src/observability/broadcast-queue.ts:85 — bulk upsert, onConflict, ignoreDuplicates, select", async () => {
		const ids = ["evt-1", "evt-2"];
		const first = await client.from("broadcast_event_receipts").upsert(ids.map((event_id) => ({ event_id })), { onConflict: "event_id", ignoreDuplicates: true }).select("event_id");
		expect(first.data).toEqual([{ event_id: "evt-1" }, { event_id: "evt-2" }]);
		const second = await client.from("broadcast_event_receipts").upsert(["evt-2", "evt-3"].map((event_id) => ({ event_id })), { onConflict: "event_id", ignoreDuplicates: true }).select("event_id");
		expect(second.data).toEqual([{ event_id: "evt-3" }]);
	});

	it("apps/api/src/core/realtime-sessions.ts:1253 — update(...).eq().eq().select('*').single()", async () => {
		const { data, error } = await client
			.from("oauth_authorizations")
			.update({ last_used_at: "2026-11-01T12:00:00.000Z", revoked_at: null })
			.eq("client_id", "cli")
			.eq("id", "30000000-0000-0000-0000-000000000002")
			.select("*")
			.single();
		expect(error).toBeNull();
		expect(data).toMatchObject({ id: "30000000-0000-0000-0000-000000000002", last_used_at: "2026-11-01T12:00:00+00:00" });
	});

	it("apps/api/src/routes/v1/control/guardrails.ts:591 — delete({ count: 'exact' }).eq().in()", async () => {
		await db.exec("insert into tags values ('g1','G1'),('g2','G2'),('g3','G3')");
		const { error, count } = await client.from("tags").delete({ count: "exact" }).like("tag_id", "g%").in("tag_id", ["g1", "g3"]);
		expect(error).toBeNull();
		expect(count).toBe(2);
	});

	it("apps/web-api/src/routes/account/models.ts:535 — select(cols, { count: 'exact' }).order(desc).range(page)", async () => {
		const page = 2;
		const pageSize = 1;
		const res = await client.from("models").select("model_slug,created_at", { count: "exact" }).order("model_slug", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
		expect(res.count).toBe(4);
		expect(res.data).toEqual([{ model_slug: "gpt-6-mini", created_at: "2026-01-01T00:00:00+00:00" }]);
	});

	it("apps/api/src/routes/v1/control/me-account.ts:97 — eq + is(null) + order(nullsFirst: false)", async () => {
		const result = await client.from("oauth_authorizations").select("id,client_id,workspace_id,last_used_at").eq("user_id", ADA).is("revoked_at", null).order("last_used_at", { ascending: false, nullsFirst: false });
		expect(result.data).toEqual([{ id: "30000000-0000-0000-0000-000000000001", client_id: "cli", workspace_id: ACME, last_used_at: "2026-10-02T00:00:00+00:00" }]);
	});
});
