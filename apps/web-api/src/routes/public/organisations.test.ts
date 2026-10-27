import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/page-catalogue", async (importOriginal) => ({
	...await importOriginal<typeof import("@/models/page-catalogue")>(),
	fetchModelsPageCatalogue: vi.fn(async () => ({
		pricingComplete: true,
		models: [{
		model_id: "openai/gpt-test",
		name: "GPT Test",
		organisation_id: "openai",
		organisation_name: "OpenAI",
		status: "active",
		primary_date: "2026-07-01",
		primary_timestamp: Date.parse("2026-07-01"),
		primary_group_key: "2026-07",
		}],
	})),
}));

import app from "@/index";
import { fetchModelsPageCatalogue } from "@/models/page-catalogue";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public organisation routes", () => {
	it("returns parity-shaped detail, header, and model resources", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("v2_lab_links")) return new Response(JSON.stringify([{ platform: "website", url: "https://openai.com" }]), { status: 200 });
			if (url.includes("/v2_labs?")) {
				return new Response(JSON.stringify([{
					lab_slug: "openai",
					name: "OpenAI",
					country_code: "US",
					description: "AI research company",
					metadata: { colour: "#000000" },
					updated_at: "2026-07-14T00:00:00.000Z",
					organisation_links: [{ platform: "website", url: "https://openai.com" }],
				}]), { status: 200 });
			}
			if (url.includes("/v2_models?")) throw new Error("organisation models must come from the catalogue");
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const [detail, header, models] = await Promise.all([
			app.request("https://phaseo.app/api/_web/organisations/openai?limit=12", {}, env),
			app.request("https://phaseo.app/api/_web/organisations/openai/header", {}, env),
			app.request("https://phaseo.app/api/_web/organisations/openai/models", {}, env),
		]);

		for (const response of [detail, header, models]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
				"public, max-age=86400, stale-while-revalidate=604800",
			);
			expect(response.headers.get("cache-tag")).toContain("web-api-organisations");
		}
		await expect(detail.json()).resolves.toMatchObject({
			organisation: {
				organisation_id: "openai",
				organisation_links: [{ platform: "website" }],
				recent_models: [{
					model_id: "openai/gpt-test",
					organisation_name: "OpenAI",
					primary_group_key: "2026-07",
				}],
				performance_models: [{ model_id: "openai/gpt-test" }],
				models: { active: [{ model_id: "openai/gpt-test" }] },
			},
		});
		await expect(header.json()).resolves.toEqual({
			organisation: {
				organisation_id: "openai",
				name: "OpenAI",
				country_code: "US",
				subdivision_code: null,
			},
		});
		await expect(models.json()).resolves.toMatchObject({
			models: [{
				model_id: "openai/gpt-test",
				organisation_name: "OpenAI",
				status: "active",
				primary_group_key: "2026-07",
			}],
		});
	});

	it("returns the newest models first, and only the newest when a limit is given", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/v2_labs?")) return new Response(JSON.stringify([{ lab_slug: "openai", name: "OpenAI", metadata: {} }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		// Catalogue order is not by date, and one model has no date at all.
		vi.mocked(fetchModelsPageCatalogue).mockImplementation(async () => ({
			pricingComplete: true,
			models: [
				{ model_id: "openai/announced-only", primary_timestamp: Date.parse("2026-09-01") },
				{ model_id: "openai/undated", primary_timestamp: null },
				{ model_id: "openai/newest", primary_timestamp: Date.parse("2026-10-01") },
				{ model_id: "openai/older", primary_timestamp: Date.parse("2026-03-01") },
			],
		}) as unknown as Awaited<ReturnType<typeof fetchModelsPageCatalogue>>);

		const ids = async (query: string) => {
			const response = await app.request(`https://phaseo.app/api/_web/organisations/openai/models${query}`, {}, env);
			expect(response.status).toBe(200);
			return ((await response.json()) as { models: Array<{ model_id: string }> }).models.map((model) => model.model_id);
		};
		expect(await ids("?limit=2")).toEqual(["openai/newest", "openai/announced-only"]);
		expect(await ids("?limit=10")).toEqual(["openai/newest", "openai/announced-only", "openai/older", "openai/undated"]);
		expect(await ids("")).toEqual(["openai/newest", "openai/announced-only", "openai/older", "openai/undated"]);
	});

	it("does not attach public cache headers to missing organisations", async () => {
		vi.stubGlobal("fetch", vi.fn(async () =>
			new Response(JSON.stringify([]), { status: 200 }),
		));

		const response = await app.request(
			"https://phaseo.app/api/_web/organisations/missing/header",
			{},
			env,
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});
});
