import { afterEach, describe, expect, it, vi } from "vitest";

import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("account display preferences", () => {
	it("returns the authenticated user's persisted preferences", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
			}
			return new Response(JSON.stringify([{
				display_locale: "en-GB",
				display_date_style: "long",
				display_time_zone: "Europe/London",
				display_hour_cycle: "24h",
				display_relative_time: "absolute",
				display_number_notation: "compact",
				display_light_palette: "paper",
				display_dark_palette: "slate",
				display_light_accent: "#7c3aed",
				display_dark_accent: "#a78bfa",
				display_density: "compact",
				display_code_language: "python",
				display_landing_page: "models",
				obfuscate_info: true,
			}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/settings/preferences",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({
			signedIn: true,
			preferences: {
				locale: "en-GB",
				dateStyle: "long",
				timeZone: "Europe/London",
				hourCycle: "24h",
				relativeTime: "absolute",
				numberNotation: "compact",
				lightPalette: "paper",
				darkPalette: "slate",
				lightAccent: "#7c3aed",
				darkAccent: "#a78bfa",
				density: "compact",
				codeLanguage: "python",
				landingPage: "models",
				maskSensitiveData: true,
			},
		});
	});

	it("validates and persists a complete preference set", async () => {
		let persisted: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : null;
			const url = request?.url ?? String(input);
			const method = request?.method ?? init?.method ?? "GET";
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
			}
			if (method === "POST") {
				persisted = JSON.parse(request ? await request.text() : String(init?.body ?? "{}"));
				return new Response(null, { status: 201 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const preferences = {
			locale: "en-US",
			dateStyle: "iso",
			timeZone: "America/New_York",
			hourCycle: "12h",
			relativeTime: "relative",
			numberNotation: "standard",
			lightPalette: "warm",
			darkPalette: "midnight",
			lightAccent: "#c2410c",
			darkAccent: "#fb923c",
			density: "comfortable",
			codeLanguage: "typescript",
			landingPage: "chat",
			maskSensitiveData: false,
		};
		const response = await app.request(
			"https://phaseo.app/api/account/settings/preferences",
			{
				method: "PUT",
				headers: { authorization: "Bearer session-token", "content-type": "application/json" },
				body: JSON.stringify(preferences),
			},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, preferences });
		expect(persisted).toMatchObject({
			user_id: "user-1",
			display_locale: "en-US",
			display_date_style: "iso",
			display_time_zone: "America/New_York",
			display_hour_cycle: "12h",
			display_relative_time: "relative",
			display_number_notation: "standard",
			display_light_palette: "warm",
			display_dark_palette: "midnight",
			display_light_accent: "#c2410c",
			display_dark_accent: "#fb923c",
			display_density: "comfortable",
			display_code_language: "typescript",
			display_landing_page: "chat",
			obfuscate_info: false,
		});
	});

	it("rejects invalid time zones", async () => {
		vi.stubGlobal("fetch", vi.fn(async () =>
			new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 }),
		));
		const response = await app.request(
			"https://phaseo.app/api/account/settings/preferences",
			{
				method: "PUT",
				headers: { authorization: "Bearer session-token", "content-type": "application/json" },
				body: JSON.stringify({
					locale: "system",
					dateStyle: "medium",
					timeZone: "not a time zone",
					hourCycle: "system",
					relativeTime: "contextual",
					numberNotation: "standard",
					lightPalette: "phaseo",
					darkPalette: "phaseo",
					lightAccent: "#0069a8",
					darkAccent: "#0078b8",
					density: "comfortable",
					codeLanguage: "typescript",
					landingPage: "home",
					maskSensitiveData: false,
				}),
			},
			env,
		);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "invalid_display_preferences" });
	});
});
