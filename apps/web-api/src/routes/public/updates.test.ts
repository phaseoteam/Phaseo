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
		"/api/_web/updates/web",
		"/api/_web/updates/youtube",
		"/api/_web/updates/latest",
		"/api/internal/watchers/web",
	])("does not expose retired watcher route %s", async (path) => {
		const response = await app.request(`https://phaseo.app${path}`, {}, env);
		expect(response.status).toBe(404);
	});

	it("returns model cards, split events, and organisation release events", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
			model_slug: "openai/gpt-test",
			name: "GPT Test",
			lab_slug: "openai",
			announced_at: "2020-01-01",
			released_at: "2020-02-01",
			deprecated_at: "2099-01-01",
			retired_at: null,
			lab: { lab_slug: "openai", name: "OpenAI" },
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

	it("uses catalogue availability to break equal lifecycle-date ties", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
			{
				model_slug: "spacex-ai/grok-4.7",
				name: "Grok 4.7",
				lab_slug: "spacex-ai",
				released_at: "2026-09-21T00:00:00Z",
				created_at: "2026-08-13T00:00:00Z",
				lab: { lab_slug: "spacex-ai", name: "xAI" },
			},
			{
				model_slug: "xiaomi/mimo-v2.6-flash",
				name: "MiMo V2.6 Flash",
				lab_slug: "xiaomi",
				released_at: "2026-09-21T00:00:00Z",
				created_at: "2026-09-21T12:00:00Z",
				lab: { lab_slug: "xiaomi", name: "Xiaomi" },
			},
		]), { status: 200 })));

		const [response, cardsResponse] = await Promise.all([
			app.request(
				"https://phaseo.app/api/_web/updates/models?limit=5&upcoming_limit=0",
				{},
				env,
			),
			app.request("https://phaseo.app/api/_web/updates/models/cards?limit=5", {}, env),
		]);

		expect(response.status).toBe(200);
		expect(cardsResponse.status).toBe(200);
		const body = await response.json() as {
			past: Array<{ model: { model_id: string }; cataloguedAt?: string }>;
		};
		const cardsBody = await cardsResponse.json() as { updates: Array<{ title: string }> };
		expect(body.past.map((event) => event.model.model_id)).toEqual([
			"xiaomi/mimo-v2.6-flash",
			"spacex-ai/grok-4.7",
		]);
		expect(cardsBody.updates.map((update) => update.title)).toEqual([
			"MiMo V2.6 Flash",
			"Grok 4.7",
		]);
		expect(body.past.every((event) => event.cataloguedAt === undefined)).toBe(true);
	});
});
