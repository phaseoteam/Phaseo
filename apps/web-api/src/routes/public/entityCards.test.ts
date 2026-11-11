import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalogueRows = [
	{
		model_id: "acme/rocket-2",
		name: "Rocket 2",
		organisation_id: "acme",
		organisation_name: "Acme",
		primary_date: "2026-10-01",
		primary_timestamp: Date.parse("2026-10-01"),
		gateway_status: "active",
		lowest_standard_input_price: 0.0004,
		lowest_standard_output_price: 12.5,
		context_lengths: [131072, 1_000_000],
		gateway_active_provider_count: 1,
		gateway_provider_count: 2,
		gateway_provider_details: [
			{ id: "fastinfer", name: "FastInfer", is_active: true },
			{ id: "slowinfer", name: "SlowInfer", is_active: false },
		],
		pricing_provider_id: "fastinfer",
		gateway_input_modalities: ["text", "image"],
		gateway_output_modalities: ["text"],
		gateway_features: ["reasoning", "tools"],
		gateway_tiers: ["standard", "batch", "free"],
		license: "Apache-2.0",
		popularity_tokens_week: 900,
	},
	{
		model_id: "acme/rocket-1",
		name: "Rocket 1",
		organisation_id: "acme",
		organisation_name: "Acme",
		primary_date: "2025-03-01",
		primary_timestamp: Date.parse("2025-03-01"),
		gateway_status: "deprecated",
		gateway_provider_details: [{ id: "fastinfer", name: "FastInfer", is_active: true }],
		gateway_output_modalities: ["image"],
		gateway_tiers: ["standard"],
		license: "Proprietary",
		popularity_tokens_week: 5000,
	},
];

vi.mock("@/models/page-catalogue", async (importOriginal) => ({
	...await importOriginal<typeof import("@/models/page-catalogue")>(),
	fetchModelsPageCatalogue: vi.fn(async (_env: unknown, query: { organisationId?: string } = {}) => ({
		pricingComplete: true,
		models: catalogueRows.filter((row) => !query.organisationId || row.organisation_id === query.organisationId).map((row) => ({ ...row })),
	})),
}));

import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });

/** Answers each PostgREST table or RPC the cards read; anything else is an empty list. */
function stubDatabase(overrides: Record<string, unknown> = {}) {
	const responses: Record<string, unknown> = {
		"rpc/get_v2_model_provider_attempt_health": [{
			provider_id: "fastinfer", service_tier: "standard", attempts: 200, eligible_attempts: 200, success_attempts: 199,
			reachability_failures: 1, capacity_failures: 0, call_error_failures: 0, buckets: [],
		}],
		"v2_benchmark_results?select=benchmark_id%2Cscore_numeric": [
			{ benchmark_id: "aa-intelligence-index-v4", score_numeric: 70 },
			{ benchmark_id: "aa-intelligence-index-v5", score_numeric: 52.3 },
		],
		"rpc/get_public_provider_index": [{
			provider_slug: "fastinfer", provider_name: "FastInfer", country_code: "US", default_execution_regions: ["us-east", "eu-west"],
			is_gateway_provider: true, provider_status: "active", byok_available: true, data_policy_tier: "no_training",
			zero_data_retention: true, total_model_ids: ["acme/rocket-2", "acme/rocket-1"], active_model_ids: ["acme/rocket-2"],
			requests_24h: 1234, tokens_24h: 0, tokens_30d: 0,
		}],
		"v2_model_provider_routes": [{ model_slug: "acme/rocket-2", created_at: "2026-10-02" }, { model_slug: "acme/rocket-1", created_at: "2025-03-02" }],
		"v2_models?select=model_slug%2Cname%2Creleased_at": [
			{ model_slug: "acme/rocket-2", name: "Rocket 2", released_at: "2026-10-01", status: "active" },
			{ model_slug: "acme/rocket-1", name: "Rocket 1", released_at: "2025-03-01", status: "deprecated" },
		],
		"rpc/get_top_models_stats_tokens": [
			{ model_id: "acme/rocket-1", request_count: 999 },
			{ model_id: "acme/stealth", request_count: 50 },
			{ model_id: "acme/rocket-2", request_count: 10 },
		],
		"v2_labs?select=lab_slug%2Cname%2Ccountry_code&": [{ lab_slug: "acme", name: "Acme", country_code: "GB" }],
		...overrides,
	};
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const match = Object.keys(responses).sort((left, right) => right.length - left.length).find((key) => url.includes(`/rest/v1/${key}`));
		const value = match ? responses[match] : [];
		const body = typeof value === "function" ? (value as (url: string) => unknown)(decodeURIComponent(url)) : value;
		// Count queries (head: true) read the total from Content-Range, as PostgREST sends it.
		if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "Content-Range": `*/${Number(body) || 0}` } });
		return json(body);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

/** Family totals and release-date bounds, answered the way the database would aggregate them. */
function familyAggregateStubs(options: { total: number; active: number; released?: [string, string]; announced?: [string, string] }) {
	const bound = (dates: [string, string] | undefined, column: string) => (url: string) =>
		dates ? [{ [column]: url.includes(`order=${column}.asc`) ? dates[0] : dates[1] }] : [];
	return {
		"v2_models?select=model_slug&": (url: string) => (url.includes("status=eq.active") ? options.active : options.total),
		"v2_models?select=released_at&": bound(options.released, "released_at"),
		"v2_models?select=announced_at&": bound(options.announced, "announced_at"),
	};
}

const get = (path: string) => app.request(`https://phaseo.app/api/_web/entity-cards/${path}`, {}, env);

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("entity card route", () => {
	it("returns a model card with live-cache headers and catalogue tags", async () => {
		stubDatabase();
		const response = await get("model/acme/rocket-2");
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900, stale-if-error=3600");
		expect(response.headers.get("cache-tag")).toContain("web-api-entity-cards");
		expect(response.headers.get("cache-tag")).toContain("web-api-models");
		const { card } = await response.json() as { card: Record<string, unknown> };
		expect(card).toMatchObject({
			kind: "model",
			id: "acme/rocket-2",
			name: "Rocket 2",
			organisation: { id: "acme", name: "Acme" },
			releaseDate: "2026-10-01",
			status: "active",
			inputPrice: 0.0004,
			outputPrice: 12.5,
			context: 1_000_000,
			providers: { active: 1, total: 2 },
			cheapestProvider: { id: "fastinfer", name: "FastInfer" },
			inputModalities: ["text", "image"],
			uptimePct: 99.5,
			intelligence: 52.3,
			features: ["reasoning", "tools"],
			tiers: ["batch", "free"],
		});
		// Rates only: no request or attempt counts reach a public card.
		expect(JSON.stringify(card)).not.toMatch(/attempts|requests/);
		expect(new TextEncoder().encode(JSON.stringify(card)).length).toBeLessThan(4096);
	});

	it("returns a provider card without stealth models or request counts", async () => {
		stubDatabase();
		const response = await get("provider/fastinfer");
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-providers");
		const { card } = await response.json() as { card: Record<string, unknown> };
		expect(card).toMatchObject({
			kind: "provider",
			name: "FastInfer",
			countryCode: "US",
			totalModels: 2,
			activeModels: 1,
			dataPolicyTier: "no_training",
			zeroDataRetention: true,
			byok: true,
			regions: ["us-east", "eu-west"],
			popular: { items: [{ id: "acme/rocket-1" }, { id: "acme/rocket-2" }], more: 0 },
			newest: { id: "acme/rocket-2", date: "2026-10-01", comingSoon: false },
		});
		expect(JSON.stringify(card)).not.toContain("stealth");
		expect(JSON.stringify(card)).not.toMatch(/request/);
	});

	it("returns an organisation card from the catalogue", async () => {
		stubDatabase();
		const response = await get("organisation/acme");
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-organisations");
		await expect(response.json()).resolves.toMatchObject({
			card: {
				kind: "organisation",
				name: "Acme",
				countryCode: "GB",
				since: "2025",
				models: 2,
				live: 1,
				openWeights: 1,
				providers: 1,
				latest: { id: "acme/rocket-2", date: "2026-10-01" },
				mostUsed: { id: "acme/rocket-1" },
				servedBy: { items: [{ id: "fastinfer", name: "FastInfer" }], more: 0 },
			},
		});
	});

	it("returns an app card with its weekly rank and change", async () => {
		const appGroup = [{
			reference: "chatter", public_slug: "chatter", member_ids: ["app-2", "app-2b"], app_id: "app-2", app_name: "Chatter",
			app_url: "https://www.chatter.dev/home", app_category: "coding", app_is_active: true, app_is_public: true, app_created_at: "2026-08-03T10:00:00Z",
		}];
		let rankingCall = 0;
		const fetchMock = stubDatabase({
			"rpc/get_public_app_groups": appGroup,
			"v2_web_public_usage_daily": [{ canonical_model_id: "acme/rocket-2" }, { canonical_model_id: "acme/rocket-2" }, { canonical_model_id: "acme/rocket-1" }],
			"v2_models?select=model_slug%2Cname&": [{ model_slug: "acme/rocket-2", name: "Rocket 2" }, { model_slug: "acme/rocket-1", name: "Rocket 1" }],
		});
		const base = fetchMock.getMockImplementation()!;
		fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes("/rpc/get_public_top_apps_rolling")) {
				rankingCall += 1;
				const asOf = JSON.parse(String(init?.body ?? "{}")).p_as_of as string;
				const lastWeek = Date.parse(asOf) < Date.now() - 86_400_000;
				return json(lastWeek
					? [{ app_id: "x", tokens: 10, unique_models: 1 }, { app_id: "y", tokens: 9, unique_models: 1 }, { app_id: "app-2b", tokens: 8, unique_models: 3 }]
					: [{ app_id: "x", tokens: 60, unique_models: 1 }, { app_id: "app-2b", tokens: 40, unique_models: 12 }]);
			}
			return base(input, init);
		});
		const response = await get("app/chatter");
		expect(response.status).toBe(200);
		expect(rankingCall).toBe(2);
		expect(response.headers.get("cache-tag")).toContain("web-api-app-rankings");
		const { card } = await response.json() as { card: Record<string, unknown> };
		expect(card).toMatchObject({
			kind: "app",
			id: "chatter",
			name: "Chatter",
			category: "coding",
			domain: "chatter.dev",
			rank: 2,
			tokenSharePct: 40,
			models: 12,
			rankChange: 1,
			topModels: { items: [{ id: "acme/rocket-2" }, { id: "acme/rocket-1" }], more: 0 },
			firstSeen: "2026-08-03",
		});
		expect(JSON.stringify(card)).not.toMatch(/request/);
	});

	it("returns benchmark, family, collection and country cards", async () => {
		stubDatabase({
			"v2_benchmarks?select=benchmark_id%2Cname%2Ccategory": [{ benchmark_id: "mmmu", name: "MMMU", category: "multimodal", total_models: 40, ascending_order: true }],
			"v2_benchmark_results?select=model_slug%2Cscore%2Crank": [{ model_slug: "acme/rocket-2", score: "81.2%", rank: 1 }, { model_slug: "acme/hidden", score: "80%", rank: 2 }],
			"v2_models?select=model_slug%2Cname&": [{ model_slug: "acme/rocket-2", name: "Rocket 2" }],
			"v2_model_families": [{ family_slug: "acme/rocket", name: "Rocket", lab_slug: "acme", lab: { lab_slug: "acme", name: "Acme" } }],
			"v2_models?select=model_slug%2Cname%2Cstatus": [
				{ model_slug: "acme/rocket-2", name: "Rocket 2", status: "active", released_at: "2026-10-01" },
				{ model_slug: "acme/rocket-1", name: "Rocket 1", status: "deprecated", released_at: "2025-03-01" },
			],
			...familyAggregateStubs({ total: 2, active: 1, released: ["2025-03-01", "2026-10-01"] }),
			"v2_labs?select=lab_slug%2Cname%2Ccountry_code%2Csubdivision_code%2Cmetadata": [{ lab_slug: "acme", name: "Acme", country_code: "GB" }],
		});
		const [benchmark, family, collection, country] = await Promise.all([
			get("benchmark/mmmu"),
			get("family/acme/rocket"),
			get("collection/image-generation"),
			get("country/gb"),
		]);
		for (const response of [benchmark, family, collection, country]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
		}
		await expect(benchmark.json()).resolves.toMatchObject({ card: { kind: "benchmark", name: "MMMU", models: 40, leaders: [{ id: "acme/rocket-2", score: "81.2%" }] } });
		await expect(family.json()).resolves.toMatchObject({
			card: { kind: "family", name: "Rocket", organisation: { id: "acme", name: "Acme" }, models: 2, active: 1, firstRelease: "2025-03-01", latestRelease: "2026-10-01" },
		});
		await expect(collection.json()).resolves.toMatchObject({ card: { kind: "collection", id: "image-generation", models: 1, newest: { items: [{ id: "acme/rocket-1" }] } } });
		await expect(country.json()).resolves.toMatchObject({ card: { kind: "country", id: "GB", organisations: 1, models: 2, live: 1, topOrganisations: { items: [{ id: "acme" }] } } });
	});

	it("counts a family of more than 200 models in the database, not from the member preview", async () => {
		const fetchMock = stubDatabase({
			"v2_model_families": [{ family_slug: "acme/rocket", name: "Rocket", lab_slug: "acme", lab: { lab_slug: "acme", name: "Acme" } }],
			"v2_models?select=model_slug%2Cname%2Cstatus": [
				{ model_slug: "acme/rocket-250", name: "Rocket 250", status: "active", released_at: "2026-10-01" },
				{ model_slug: "acme/rocket-249", name: "Rocket 249", status: "active", released_at: "2026-09-01" },
				{ model_slug: "acme/rocket-248", name: "Rocket 248", status: "deprecated", released_at: "2026-08-01" },
			],
			// The oldest member only has an announcement date; the newest bound is a release date.
			...familyAggregateStubs({ total: 250, active: 180, released: ["2021-06-01", "2026-10-01"], announced: ["2020-01-15", "2024-02-01"] }),
		});
		const response = await get("family/acme/rocket");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			card: {
				kind: "family",
				models: 250,
				active: 180,
				firstRelease: "2020-01-15",
				latestRelease: "2026-10-01",
				members: { items: [{ id: "acme/rocket-250" }, { id: "acme/rocket-249" }, { id: "acme/rocket-248" }], more: 247 },
			},
		});
		const calls = fetchMock.mock.calls.map(([input, init]) => ({ url: decodeURIComponent(String(input)), method: init?.method ?? "GET" }));
		const familyModelReads = calls.filter((call) => call.url.includes("/v2_models?"));
		// Totals are HEAD count queries; every row read is bounded to the preview or a single date.
		expect(familyModelReads.filter((call) => call.method === "HEAD")).toHaveLength(2);
		for (const call of familyModelReads.filter((call) => call.method !== "HEAD")) expect(call.url).toMatch(/limit=(1|3)(&|$)/);
		// The announcement-date bounds only cover models without a release date.
		for (const call of familyModelReads.filter((call) => call.url.includes("select=announced_at"))) expect(call.url).toContain("released_at=is.null");
	});

	it("returns a briefly cached 404 for unknown ids and kinds", async () => {
		stubDatabase({ "rpc/get_public_provider_index": [] });
		const responses = await Promise.all([
			get("model/acme/missing"),
			get("model/no-slash"),
			get("provider/nobody"),
			get("collection/not-a-preset"),
			get("country/XYZ"),
			get("spaceship/acme"),
		]);
		for (const response of responses) {
			expect(response.status).toBe(404);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=300");
		}
	});

	it("answers 503 without caching when the database fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 })));
		const response = await get("organisation/acme");
		expect(response.status).toBe(503);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});
});
