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

describe("frontend search route", () => {
	it("serves the database-composed index with a short edge cache and no browser cache", async () => {
		const payload = {
			m: [["openai/gpt-test", "GPT Test", "OpenAI", "/models/openai/gpt-test", "openai", "July 2026"]],
			o: [["openai", "OpenAI", null, "/organisations/openai", "openai"]],
			b: [],
			p: [["openai", "OpenAI", null, "/api-providers/openai", "openai"]],
			s: [],
			c: [],
		};
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			let value: unknown[];
			if (url.includes("v2_models")) value = [{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", released_at: "2026-07-01", lab: { name: "OpenAI" } }];
			else if (url.includes("v2_labs")) value = [{ lab_slug: "openai", name: "OpenAI" }];
			else if (url.includes("v2_providers")) value = [{ provider_slug: "openai", name: "OpenAI" }];
			else value = [];
			return new Response(JSON.stringify(value), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			"https://phaseo.app/api/_web/search",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=0",
		);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=120, stale-while-revalidate=300",
		);
		expect(response.headers.get("cache-tag")).toBe("web-api-search");
		await expect(response.json()).resolves.toEqual(payload);
	});
});
