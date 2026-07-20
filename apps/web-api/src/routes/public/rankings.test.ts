import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public rankings routes", () => {
	it("passes URL parameters to the aggregate RPC and applies volatile caching", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ model_id: "openai/gpt-test", tokens: 10 }]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await app.request("https://phaseo.app/api/_web/rankings/timeseries?time_range=month&bucket_size=day&top_n=4", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900");
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_public_usage_timeseries");
		expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"p_time_range":"month"');
		await expect(response.json()).resolves.toEqual({ data: [{ model_id: "openai/gpt-test", tokens: 10 }] });
	});
});
