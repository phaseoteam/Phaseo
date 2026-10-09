import { afterEach, describe, expect, it, vi } from "vitest";
import { publicRankingsRouter } from "./rankings";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("ranking period comparisons", () => {
	it.each([1, 7, 30])("queries both %i-day windows independently of weekly charts", async (days) => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ model_id: "model", current: 12, previous: 4 }])));
		vi.stubGlobal("fetch", fetchMock);
		const response = await publicRankingsRouter.request(`/rankings/period-leaderboard?metric=text_tokens&days=${days}`, {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=900, stale-while-revalidate=900, stale-if-error=3600");
		expect(response.headers.get("cache-tag")).toBe("web-api-rankings");
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_public_period_leaderboard");
		const body = await response.json() as { data: unknown[]; period: { start: string; end: string; previousStart: string } };
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ p_metric: "text_tokens", p_days: days, p_as_of: body.period.end });
		expect(body.data).toEqual([{ model_id: "model", current: 12, previous: 4 }]);
		expect(Date.parse(body.period.end) - Date.parse(body.period.start)).toBe(days * 24 * 60 * 60 * 1000);
		expect(Date.parse(body.period.start) - Date.parse(body.period.previousStart)).toBe(days * 24 * 60 * 60 * 1000);
	});

	it.each(["metric=unknown", "days=0", "days=60", "days=NaN"])("rejects %s before querying", async (query) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect((await publicRankingsRouter.request(`/rankings/period-leaderboard?${query}`, {}, env)).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports unavailable aggregates as errors", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "unavailable" }), { status: 400 })));
		const response = await publicRankingsRouter.request("/rankings/period-leaderboard", {}, env);
		expect(response.status).toBe(503);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});

	it.each(["today", "24h", "week", "4w", "month", "year"])("uses the rolling %s period for app and market-share totals", async (range) => {
		const fetchMock = vi.fn(async () => new Response("[]"));
		vi.stubGlobal("fetch", fetchMock);
		for (const [path, rpc] of [["top-apps", "get_public_top_apps_rolling"], ["market-share", "get_public_market_share_rolling"]]) {
			const response = await publicRankingsRouter.request(`/rankings/${path}?time_range=${range}`, {}, env);
			expect(response.status).toBe(200);
			expect(String(fetchMock.mock.lastCall?.[0])).toContain(rpc);
			expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toMatchObject({ p_time_range: range, p_as_of: expect.any(String) });
		}
	});

	it.each(["top-apps", "market-share"])("rejects unsupported %s periods instead of silently using a week", async (path) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect((await publicRankingsRouter.request(`/rankings/${path}?time_range=invalid`, {}, env)).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
