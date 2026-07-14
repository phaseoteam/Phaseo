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

		const [organisations, benchmarks, providers] = await Promise.all([
			app.request("https://phaseo.app/api/public/organisations", {}, env),
			app.request("https://phaseo.app/api/public/benchmarks?sort=coverage", {}, env),
			app.request("https://phaseo.app/api/public/api-providers", {}, env),
		]);

		for (const response of [organisations, benchmarks, providers]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
		}
		await expect(organisations.json()).resolves.toMatchObject({ organisations: [{ organisation_id: "openai" }] });
		await expect(benchmarks.json()).resolves.toMatchObject({ benchmarks: [{ benchmark_id: "mmlu" }] });
		await expect(providers.json()).resolves.toMatchObject({ providers: [{ id: "openai" }] });
	});
});
