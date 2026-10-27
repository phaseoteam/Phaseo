import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("public reference-data routes", () => {
	it("loads bounded AA data for a selected model and major", async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toContain("/rpc/get_artificial_analysis_public_models");
			expect(JSON.parse(String(init?.body))).toEqual({ p_model_slug: "lab/model", p_major: 5, p_limit: 20, p_offset: 10 });
			return Response.json({ snapshot_id: "snapshot", methodology_version: "5.0", total: 1, models: [{ model_id: "lab/model", totalTokens: { output: 0 } }] });
		});
		vi.stubGlobal("fetch", fetch);
		const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis/data?model=lab%2Fmodel&version=5&limit=20&offset=10", {}, env);
		expect(response.status).toBe(200);
		expect((await response.json() as { models: unknown[] }).models).toHaveLength(1);
		expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
	});
	it.each(["limit=201", "offset=-1", "version=4.3", "model="])("rejects invalid public data selection %s", async (query) => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		expect((await app.request(`https://phaseo.app/api/_web/benchmarks/artificial-analysis/data?${query}`, {}, env)).status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("keeps missing AA publications distinct from unavailable storage", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)));
		expect((await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis/data", {}, env)).status).toBe(404);
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "not deployed" }, { status: 503 })));
		const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis/data", {}, env);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "aa_data_unavailable" });
		expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBeNull();
	});
	it("loads AA comparisons in one nested score query and preserves configurations", async () => {
		const ids = ["aa-intelligence-index-v5", "aa-coding-index-v5", "aa-agentic-index-v5", "aa-intelligence-index-cost-v5"];
		const scoreQueries: URL[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.includes("get_artificial_analysis_coverage")) return Response.json(ids.map((benchmark_id) => ({ benchmark_id, total_models: 1, published: true })));
			if (url.pathname.endsWith("v2_models")) return Response.json([{ model_slug: "lab/model", name: "Model", hidden: false, lab_slug: "lab", lab: null }]);
			if (url.searchParams.get("select")?.includes("results:v2_benchmark_results")) {
				scoreQueries.push(url);
				return Response.json(ids.map((benchmark_id) => ({ benchmark_id, results: Array.from({ length: 300 }, (_, i) => ({
					result_id: `${benchmark_id}-${i}`, model_slug: "lab/model", score: i, variant: "high", result_key: String(i),
					other_info: `Artificial Analysis ID source-${i}; Intelligence Index v5.0`, updated_at: "2026-10-18T00:00:00Z",
				})) })));
			}
			if (url.searchParams.has("benchmark_id")) return Response.json([{ benchmark_id: ids[0], name: "Artificial Analysis Intelligence Index" }]);
			return Response.json(ids.map((benchmark_id) => ({ benchmark_id, name: benchmark_id, total_models: 1 })));
		}));
		const response = await app.request("https://phaseo.app/api/_web/benchmarks/artificial-analysis", {}, env);
		expect(response.status).toBe(200);
		const { benchmark } = await response.json() as { benchmark: { results: unknown[]; comparison_benchmarks: Array<{ results: Array<{ variant: string; result_key: string }> }> } };
		expect(benchmark.results).toHaveLength(300);
		expect(benchmark.comparison_benchmarks.map((metric) => metric.results.length)).toEqual([300, 300, 300, 300]);
		expect(benchmark.comparison_benchmarks[0].results[0]).toMatchObject({ variant: "high", result_key: "0" });
		expect(scoreQueries).toHaveLength(1);
		expect(scoreQueries[0].searchParams.get("results.or")).toContain("effective_to.is.null");
	});

	it("keeps retired provider pages addressable and links their successor", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json([{
			provider_slug: "pioneer", name: "Pioneer", status: "deprecated", country_code: "US", subdivision_code: null,
			metadata: { retirement: { message: "Pioneer is now Fastino.", successor_provider_slug: "fastino", successor_name: "Fastino" } },
		}])));
		const response = await app.request("https://phaseo.app/api/_web/api-providers/pioneer/header", {}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ provider: {
			api_provider_id: "pioneer", api_provider_name: "Pioneer", retirement_notice: "Pioneer is now Fastino.",
			successor_provider_id: "fastino", successor_provider_name: "Fastino",
		} });
	});

	it("only exposes retirement notices for retired providers and rejects invalid successor IDs", async () => {
		for (const status of ["active", "deprecated"]) {
			vi.stubGlobal("fetch", vi.fn(async () => Response.json([{
				provider_slug: "sample", name: "Sample", status,
				metadata: { retirement: { message: "Retired.", successor_provider_slug: "../settings", successor_name: "Invalid" } },
			}])));
			const response = await app.request("https://phaseo.app/api/_web/api-providers/sample/header", {}, env);
			expect(await response.json()).toMatchObject({ provider: {
				retirement_notice: status === "deprecated" ? "Retired." : null,
				successor_provider_id: null, successor_provider_name: null,
			} });
		}
	});
    it("excludes retired plan prices from listings and detail pages", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (!url.includes("get_v2_subscription_catalogue")) return Response.json([]);
            const body = JSON.parse(String(init?.body ?? "{}"));
            expect(body.p_include_hidden).toBe(false);
            return Response.json(body.p_plan_id === "retired" ? [] : [{ plan_uuid: "active", plan_id: "active", name: "Active", offers: [] }]);
        }));
        const listing = await app.request("https://phaseo.app/api/_web/subscription-plans", {}, env);
        expect(listing.status).toBe(200);
        expect((await listing.json() as { subscription_plans: { plan_id: string }[] }).subscription_plans.map(plan => plan.plan_id))
            .toEqual(["active"]);
        const retired = await app.request("https://phaseo.app/api/_web/subscription-plans/retired", {}, env);
        expect(retired.status).toBe(404);
    });

	it("keeps reference data long-lived but refreshes scored benchmark coverage and provider information every fifteen minutes", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_labs")) {
				return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI", country_code: "US", metadata: { colour: "#000" } }]), { status: 200 });
			}
			if (url.includes("v2_benchmarks")) {
				return new Response(JSON.stringify([{ benchmark_id: "mmlu", name: "MMLU", total_models: 42 }]), { status: 200 });
			}
			return new Response(JSON.stringify([{ provider_slug: "openai", name: "OpenAI", status: "active", metadata: {} }]), { status: 200 });
		}));

		const [organisations, benchmarks, providerHeader, sources] = await Promise.all([
			app.request("https://phaseo.app/api/_web/organisations", {}, env),
			app.request("https://phaseo.app/api/_web/benchmarks?sort=coverage", {}, env),
			app.request("https://phaseo.app/api/_web/api-providers/openai/header", {}, env),
			app.request("https://phaseo.app/api/_web/sources", {}, env),
		]);

		for (const response of [organisations, benchmarks, providerHeader, sources]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
				response === benchmarks || response === providerHeader || response === sources
					? "public, max-age=900, stale-while-revalidate=900, stale-if-error=3600"
					: "public, max-age=86400, stale-while-revalidate=604800",
			);
		}
		await expect(organisations.json()).resolves.toMatchObject({ organisations: [{ organisation_id: "openai" }] });
		await expect(benchmarks.json()).resolves.toMatchObject({ benchmarks: [{ benchmark_id: "mmlu" }] });
		await expect(providerHeader.json()).resolves.toMatchObject({ provider: { api_provider_id: "openai", api_provider_name: "OpenAI" } });
		await expect(sources.json()).resolves.toMatchObject({
			sources: [{ api_provider_id: "openai", api_provider_name: "OpenAI" }],
		});
	});

	it("preserves the family and subscription-plan payloads consumed by the web app", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
            if (url.includes("/rpc/get_v2_subscription_catalogue")) return new Response(JSON.stringify([{
              plan_uuid: "plan-uuid", plan_id: "pro", name: "Pro", organisation_id: "phaseo", organisation: { organisation_id: "phaseo", name: "Phaseo" },
              offers: [{ offer_uuid: "offer", billing_interval: "month", billing_interval_count: 1, currency: "USD", components: [{ component_key: "base", pricing_type: "fixed", amount: 20, charge_basis: "account" }] }],
              features: [{ feature_name: "Requests", availability: "limited" }], allowances: [], models: [{ model_id: "openai/gpt-test" }]
            }]), { status: 200 });
			if (url.includes("v2_model_families")) {
				return new Response(JSON.stringify([{
					family_id: "openai/gpt",
					family_name: "GPT",
					organisation_id: "openai",
					organisation: { name: "OpenAI" },
					created_at: "2026-07-01T00:00:00.000Z",
					models: [{
						model_id: "openai/gpt-test",
						name: "GPT Test",
						organisation_id: "openai",
						status: "Available",
						hidden: false,
						organisation: { name: "OpenAI", colour: "#000", country_code: "US" },
					}],
				}]), { status: 200 });
			}
			if (url.includes("v2_subscription_plan_features")) {
				return new Response(JSON.stringify([{
					feature_name: "Requests",
					feature_value: "1000",
					feature_description: null,
					other_info: null,
				}]), { status: 200 });
			}
			if (url.includes("v2_subscription_plan_models")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-test",
					model_info: null,
					rate_limit: null,
					other_info: null,
					model: {
						model_id: "openai/gpt-test",
						name: "GPT Test",
						organisation_id: "openai",
						hidden: false,
						organisation: { name: "OpenAI" },
					},
				}]), { status: 200 });
			}
			if (url.includes("v2_subscription_plans")) {
				return new Response(JSON.stringify([{
					plan_uuid: "plan-uuid",
					plan_id: "pro",
					name: "Pro",
					lab_slug: "phaseo",
					description: "Pro plan",
					frequency: "month",
					price: 20,
					currency: "USD",
					link: null,
					other_info: null,
				}]), { status: 200 });
			}
			if (url.includes("/v2_models?")) return new Response(JSON.stringify([{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", hidden: false, lab: { lab_slug: "openai", name: "OpenAI", metadata: { colour: "#000" } } }]), { status: 200 });
			if (url.includes("/v2_labs?")) return new Response(JSON.stringify([{ lab_slug: "phaseo", name: "Phaseo", metadata: { colour: "#000" } }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const [families, family, plans, plan] = await Promise.all([
			app.request("https://phaseo.app/api/_web/families", {}, env),
			app.request("https://phaseo.app/api/_web/families/openai%2Fgpt", {}, env),
			app.request("https://phaseo.app/api/_web/subscription-plans", {}, env),
			app.request("https://phaseo.app/api/_web/subscription-plans/pro", {}, env),
		]);

		for (const response of [families, family, plans, plan]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-tag")).toContain("web-api-reference-data");
		}
		await expect(families.json()).resolves.toMatchObject({
			families: [{
				family_id: "openai/gpt",
				organisation_id: "openai",
				organisation_name: "OpenAI",
				created_at: "2026-07-01T00:00:00.000Z",
			}],
		});
		await expect(family.json()).resolves.toMatchObject({
			family_id: "openai/gpt",
			models: [{ model_id: "openai/gpt-test", organisation: { name: "OpenAI" } }],
		});
		await expect(plans.json()).resolves.toMatchObject({
			subscription_plans: [{ plan_id: "pro", prices: [{ price: 20 }] }],
		});
		await expect(plan.json()).resolves.toMatchObject({
			subscription_plan: {
				plan_id: "pro",
				features: [{ feature_name: "Requests" }],
				models: [{ model_id: "openai/gpt-test" }],
			},
		});
	});

	it("returns a benchmark detail payload without hidden model results", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_benchmark_results")) return new Response(JSON.stringify([{
				result_id: "visible", model_slug: "openai/gpt-test", benchmark_id: "mmlu", score: 88, is_self_reported: false,
			}]), { status: 200 });
			if (url.includes("v2_models")) return new Response(JSON.stringify([{
				model_slug: "openai/gpt-test", name: "GPT Test", hidden: false, lab_slug: "openai", lab: { lab_slug: "openai", name: "OpenAI", metadata: { colour: "#000" } },
			}]), { status: 200 });
			return new Response(JSON.stringify([{
			benchmark_id: "mmlu",
			name: "MMLU",
			category: "Knowledge",
			ascending_order: false,
			total_models: 2,
			link: "https://example.com/mmlu",
			type: "score",
		}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/benchmarks/mmlu",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-benchmark-mmlu");
		await expect(response.json()).resolves.toMatchObject({
			benchmark: {
				id: "mmlu",
				results: [{
					id: "visible",
					model: { organisation: { organisation_id: "openai" } },
				}],
			},
		});
	});

	it("reuses the compact database-backed catalogue for country models", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_payload")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					name: "GPT Test",
					organisation_id: "openai",
					primary_date: "2026-07-01",
					primary_timestamp: Date.parse("2026-07-01"),
					gateway_status: "active",
					gateway_provider_count: 1,
					gateway_active_provider_count: 1,
					gateway_execution_regions: ["us"],
				}]), { status: 200 });
			}
			if (url.includes("get_public_monitor_rows_payload")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					api_model_id: "gpt-test",
					provider_id: "openai",
					api_provider_name: "OpenAI",
					capability_id: "chat/completions",
					capability_status: "active",
					is_active_gateway: true,
					input_price: 1,
					output_price: 2,
				}]), { status: 200 });
			}
			if (url.includes("v2_providers")) {
				return new Response(JSON.stringify([{
					api_provider_id: "openai",
					default_execution_regions: ["us"],
				}]), { status: 200 });
			}
			if (url.includes("v2_labs")) {
				return new Response(JSON.stringify([{
					lab_slug: "openai",
					name: "OpenAI",
					country_code: "US",
					metadata: { colour: "#000" },
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([{
				model_id: "openai/gpt-test",
				name: "GPT Test",
				organisation_id: "openai",
				release_date: "2026-07-01",
				input_types: ["text"],
				output_types: ["text"],
			}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/_web/countries/US",
			{},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			country: {
				iso: "US",
				organisations: [{
					organisation_id: "openai",
					models: [{
						model_id: "openai/gpt-test",
						organisation: { name: "OpenAI", colour: "#000" },
						gateway_status: "active",
						gateway_execution_regions: ["us"],
					}],
				}],
			},
		});
	});
});
