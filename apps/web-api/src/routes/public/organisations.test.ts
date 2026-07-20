import { afterEach, describe, expect, it, vi } from "vitest";
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
			if (url.includes("data_organisations")) {
				return new Response(JSON.stringify([{
					organisation_id: "openai",
					name: "OpenAI",
					country_code: "US",
					description: "AI research company",
					colour: "#000000",
					updated_at: "2026-07-14T00:00:00.000Z",
					organisation_links: [{ platform: "website", url: "https://openai.com" }],
				}]), { status: 200 });
			}
			if (url.includes("data_models")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					name: "GPT Test",
					status: "Available",
					organisation_id: "openai",
					hidden: false,
					release_date: "2026-07-01",
					announcement_date: "2026-06-30",
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
				models: { Available: [{ model_id: "openai/gpt-test" }] },
			},
		});
		await expect(header.json()).resolves.toEqual({
			organisation: {
				organisation_id: "openai",
				name: "OpenAI",
				country_code: "US",
			},
		});
		await expect(models.json()).resolves.toMatchObject({
			models: [{ model_id: "openai/gpt-test", status: "Available" }],
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
