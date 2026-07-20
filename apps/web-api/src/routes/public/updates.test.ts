import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("public update routes", () => {
	it.each([
		["web", "Open", "Web Update", "globe"],
		["youtube", "Watch", "YouTube Watcher", "monitor-play"],
	] as const)("maps %s rows to the existing update-card contract", async (
		updateType,
		cta,
		label,
		iconName,
	) => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
			id: `${updateType}-1`,
			type: updateType,
			who: "Phaseo",
			title: "An update",
			link: "https://phaseo.app/updates",
			created_at: "2026-07-14T12:00:00.000Z",
		}]), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request(
			`https://phaseo.app/api/_web/updates/${updateType}?limit=1000`,
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
			"public, max-age=900, stale-while-revalidate=3600",
		);
		expect(response.headers.get("cache-tag")).toContain(
			`web-api-updates-${updateType}`,
		);
		await expect(response.json()).resolves.toMatchObject({
			updates: [{
				id: `${updateType}-1`,
				link: { cta, external: true },
				badges: [{ label, iconName }],
			}],
		});

		const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(requestUrl).toContain("limit=100");
	});

	it("returns the mixed latest-update card contract", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			id: "youtube-1",
			type: "youtube",
			who: "Phaseo",
			title: "A video",
			link: "https://youtu.be/example",
			created_at: "2026-07-14T12:00:00.000Z",
		}]), { status: 200 })));

		const response = await app.request(
			"https://phaseo.app/api/_web/updates/latest?limit=5",
			{},
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toContain("web-api-updates-latest");
		await expect(response.json()).resolves.toMatchObject({
			updates: [{
				id: "youtube-1",
				link: { cta: "Watch", external: true },
				badges: [{ label: "YouTube Watcher", iconName: "monitor-play" }],
			}],
		});
	});

	it("returns model cards, split events, and organisation release events", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			model_id: "openai/gpt-test",
			name: "GPT Test",
			organisation_id: "openai",
			announcement_date: "2020-01-01",
			release_date: "2020-02-01",
			deprecation_date: "2099-01-01",
			retirement_date: null,
			organisation: { organisation_id: "openai", name: "OpenAI" },
		}]), { status: 200 })));

		const [cards, split, releases] = await Promise.all([
			app.request("https://phaseo.app/api/_web/updates/models/cards?limit=5", {}, env),
			app.request("https://phaseo.app/api/_web/updates/models?limit=5&upcoming_limit=5", {}, env),
			app.request("https://phaseo.app/api/_web/updates/organisations/openai/releases", {}, env),
		]);

		for (const response of [cards, split, releases]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-tag")).toContain("web-api-model-updates");
		}
		expect(await cards.json()).toMatchObject({
			updates: expect.arrayContaining([expect.objectContaining({
				title: "GPT Test",
				badges: expect.arrayContaining([
					expect.objectContaining({ label: "Release", iconName: "rocket" }),
				]),
				link: expect.objectContaining({ href: "/models/openai/gpt-test", cta: "View" }),
			})]),
		});
		await expect(split.json()).resolves.toMatchObject({
			past: expect.arrayContaining([
				expect.objectContaining({ types: ["Released"] }),
				expect.objectContaining({ types: ["Announced"] }),
			]),
			future: [expect.objectContaining({ types: ["Deprecated"] })],
		});
		await expect(releases.json()).resolves.toMatchObject({
			events: [{
				model: { model_id: "openai/gpt-test" },
				types: ["Released"],
			}],
		});
	});
});
