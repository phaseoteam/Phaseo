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
	it("returns stable public datasets with a long-lived edge policy", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("data_organisations")) {
				return new Response(JSON.stringify([{ organisation_id: "openai", name: "OpenAI", country_code: "US", colour: "#000" }]), { status: 200 });
			}
			if (url.includes("data_benchmarks")) {
				return new Response(JSON.stringify([{ id: "mmlu", name: "MMLU", total_models: 42 }]), { status: 200 });
			}
			return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
		}));

		const [organisations, benchmarks, providerHeader, sources] = await Promise.all([
			app.request("https://phaseo.app/api/_web/organisations", {}, env),
			app.request("https://phaseo.app/api/_web/benchmarks?sort=coverage", {}, env),
			app.request("https://phaseo.app/api/_web/api-providers/openai/header", {}, env),
			app.request("https://phaseo.app/api/_web/sources", {}, env),
		]);

		for (const response of [organisations, benchmarks, providerHeader, sources]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
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
			if (url.includes("data_model_families")) {
				return new Response(JSON.stringify([{
					family_id: "openai/gpt",
					family_name: "GPT",
					organisation_id: "openai",
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
			if (url.includes("data_subscription_plan_features")) {
				return new Response(JSON.stringify([{
					feature_name: "Requests",
					feature_value: "1000",
					feature_description: null,
					other_info: null,
				}]), { status: 200 });
			}
			if (url.includes("data_subscription_plan_models")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
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
			if (url.includes("data_subscription_plans")) {
				return new Response(JSON.stringify([{
					plan_uuid: "plan-uuid",
					plan_id: "pro",
					name: "Pro",
					organisation_id: "phaseo",
					description: "Pro plan",
					frequency: "month",
					price: 20,
					currency: "USD",
					link: null,
					other_info: null,
					organisation: { organisation_id: "phaseo", name: "Phaseo", colour: "#000" },
				}]), { status: 200 });
			}
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
			families: [{ family_id: "openai/gpt", organisation_id: "openai" }],
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
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			id: "mmlu",
			name: "MMLU",
			category: "Knowledge",
			ascending_order: false,
			total_models: 2,
			link: "https://example.com/mmlu",
			type: "score",
			data_benchmark_results: [
				{
					id: "visible",
					model_id: "openai/gpt-test",
					score: 88,
					is_self_reported: false,
					data_models: {
						model_id: "openai/gpt-test",
						name: "GPT Test",
						hidden: false,
						data_organisations: {
							organisation_id: "openai",
							name: "OpenAI",
							colour: "#000",
						},
					},
				},
				{
					id: "hidden",
					model_id: "internal/model",
					score: 99,
					is_self_reported: false,
					data_models: { model_id: "internal/model", hidden: true },
				},
			],
		}]), { status: 200 })));

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
			if (url.includes("get_public_models_page_rows")) {
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
			if (url.includes("get_monitor_model_rows")) {
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
			if (url.includes("data_api_providers")) {
				return new Response(JSON.stringify([{
					api_provider_id: "openai",
					default_execution_regions: ["us"],
				}]), { status: 200 });
			}
			if (url.includes("data_organisations")) {
				return new Response(JSON.stringify([{
					organisation_id: "openai",
					name: "OpenAI",
					country_code: "US",
					colour: "#000",
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
