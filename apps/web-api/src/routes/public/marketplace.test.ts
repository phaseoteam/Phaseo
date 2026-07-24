import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public marketplace routes", () => {
	it("returns only public preset list and detail data", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("select=id%2Cname&")) {
				return new Response(JSON.stringify([{
					id: "source-1",
					name: "Source preset",
				}]), { status: 200 });
			}
			if (url.includes("config")) {
				return new Response(JSON.stringify([{
					id: "preset-1",
					name: "Public preset",
					description: "A preset",
					config: { strategy: "quality" },
					visibility: "public",
					created_at: "2026-07-14T00:00:00.000Z",
					source_preset_id: "source-1",
				}]), { status: 200 });
			}
			return new Response(JSON.stringify([{
				id: "preset-1",
				name: "Public preset",
				description: "A preset",
				created_at: "2026-07-14T00:00:00.000Z",
				source_preset_id: "source-1",
			}]), { status: 200 });
		}));

		const [list, detail] = await Promise.all([
			app.request("https://phaseo.app/api/_web/marketplace/presets", {}, env),
			app.request("https://phaseo.app/api/_web/marketplace/presets/preset-1", {}, env),
		]);

		for (const response of [list, detail]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
				"public, max-age=900, stale-while-revalidate=3600",
			);
			expect(response.headers.get("cache-tag")).toContain("web-api-marketplace");
		}
		await expect(list.json()).resolves.toMatchObject({
			presets: [{ id: "preset-1", name: "Public preset" }],
		});
		await expect(detail.json()).resolves.toMatchObject({
			preset: { id: "preset-1", visibility: "public" },
			sourcePreset: { id: "source-1", name: "Source preset" },
		});
	});

	it("does not cache missing or non-public presets", async () => {
		vi.stubGlobal("fetch", vi.fn(async () =>
			new Response(JSON.stringify([]), { status: 200 }),
		));
		const response = await app.request(
			"https://phaseo.app/api/_web/marketplace/presets/private-1",
			{},
			env,
		);
		expect(response.status).toBe(404);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});
});
