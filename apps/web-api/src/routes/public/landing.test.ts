import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public landing routes", () => {
	it("returns model statistics and selected visible models", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("data_api_provider_models")) {
				return new Response(JSON.stringify([
					{ model_id: "openai/gpt-test", api_model_id: "gpt-test" },
					{ model_id: "openai/gpt-test", api_model_id: "gpt-test-alt" },
				]), { status: 200 });
			}
			if (url.includes("data_organisations")) {
				return new Response(JSON.stringify([{
					model_id: "openai/gpt-test",
					name: "GPT Test",
					release_date: "2026-07-01",
					data_organisations: {
						organisation_id: "openai",
						name: "OpenAI",
						colour: "#000",
					},
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([
				{
					model_id: "openai/gpt-test",
					organisation_id: "openai",
					release_date: "2026-07-01",
				},
				{
					model_id: "anthropic/claude-test",
					organisation_id: "anthropic",
					release_date: "2020-01-01",
				},
			]), { status: 200 });
		}));

		const [stats, main] = await Promise.all([
			app.request("https://phaseo.app/api/_web/landing/models/stats", {}, env),
			app.request("https://phaseo.app/api/_web/landing/models/main?ids=openai%2Fgpt-test", {}, env),
		]);

		expect(stats.status).toBe(200);
		expect(stats.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		await expect(stats.json()).resolves.toEqual({
			modelsCount: 2,
			orgsCount: 2,
			apiCount: 1,
			recentCount: 1,
		});
		expect(main.status).toBe(200);
		expect(main.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=86400, stale-while-revalidate=604800",
		);
		await expect(main.json()).resolves.toMatchObject({
			models: [{ model_id: "openai/gpt-test", name: "GPT Test" }],
		});
	});
});
