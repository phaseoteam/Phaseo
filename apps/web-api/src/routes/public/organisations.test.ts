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
			if (url.includes("/v2_models?")) {
				return new Response(JSON.stringify([{
					model_slug: "openai/gpt-test",
					name: "GPT Test",
					status: "active",
					lab_slug: "openai",
					hidden: false,
					released_at: "2026-07-01",
					announced_at: "2026-06-30",
				}]), { status: 200 });
			}
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
			models: [{ model_id: "openai/gpt-test", status: "active" }],
		});
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
