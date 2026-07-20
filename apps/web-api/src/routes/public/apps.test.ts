import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public app routes", () => {
	it("returns IDs, detail, usage, and recent requests with volatility-specific caching", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("gateway_usage_rollup_daily_app_model")) {
				return new Response(JSON.stringify([{
					day_bucket: "2026-07-14",
					canonical_model_id: "openai/gpt-test",
					requests: 10,
					success_requests: 9,
					total_tokens: 1_000,
					total_cost_nanos: 500,
				}]), { status: 200 });
			}
			if (url.includes("gateway_usage_rollup_daily_app")) {
				return new Response(JSON.stringify([{
					requests: 10,
					success_requests: 9,
					total_tokens: 1_000,
				}]), { status: 200 });
			}
			if (url.includes("gateway_requests")) {
				return new Response(JSON.stringify([{
					created_at: "2026-07-14T12:00:00.000Z",
					usage: { total_tokens: 100 },
					cost_nanos: 50,
					model_id: "openai/gpt-test",
					provider: "openai",
					success: true,
				}]), { status: 200 });
			}
			if (url.includes("api_apps") && url.includes("select=id")) {
				return new Response(JSON.stringify([{ id: "app-1" }]), { status: 200 });
			}
			if (url.includes("api_apps")) {
				return new Response(JSON.stringify([{
					id: "app-1",
					slug: "my-app",
					title: "My App",
					is_public: true,
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const [ids, detail, usage, recent] = await Promise.all([
			app.request("https://phaseo.app/api/_web/apps/ids", {}, env),
			app.request("https://phaseo.app/api/_web/apps/my-app", {}, env),
			app.request("https://phaseo.app/api/_web/apps/my-app/usage?range=4w", {}, env),
			app.request("https://phaseo.app/api/_web/apps/my-app/requests/recent?limit=5", {}, env),
		]);

		expect(ids.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=86400, stale-while-revalidate=604800",
		);
		await expect(ids.json()).resolves.toEqual({ ids: ["app-1"] });
		expect(detail.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=3600",
		);
		await expect(detail.json()).resolves.toMatchObject({
			app: { id: "app-1", slug: "my-app", total_tokens: 1_000, total_requests: 9 },
		});
		expect(usage.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=900",
		);
		await expect(usage.json()).resolves.toMatchObject({
			usage: [{ model_id: "openai/gpt-test", requests: 10, successful_requests: 9 }],
		});
		expect(recent.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=60, stale-while-revalidate=300",
		);
		await expect(recent.json()).resolves.toMatchObject({
			requests: [{ model_id: "openai/gpt-test", provider: "openai" }],
		});
	});

	it("does not cache missing or private app references", async () => {
		vi.stubGlobal("fetch", vi.fn(async () =>
			new Response(JSON.stringify([]), { status: 200 }),
		));
		const response = await app.request(
			"https://phaseo.app/api/_web/apps/private-app",
			{},
			env,
		);
		expect(response.status).toBe(404);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});
});
