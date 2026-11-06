import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import app from "@/index";
import { OAUTH_CLIENT_WRITE_REFUSAL, oauthClientMayWrite } from "./oauthClientWrites";

// Tokens the auth provider's OAuth server issues carry the client's client_id. Phaseo's CLI and desktop app use
// public client IDs, so any such token may write only an explicit list of ordinary routes; every other write in
// web-api is refused before its handler runs, including routes added later.

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } as Env;
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as never;

function token(claims: Record<string, unknown>) {
	const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", aal: "aal2", ...claims })}.signature`;
}

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Every write route web-api registers under /api, with path parameters filled in. */
const writeRoutes = Array.from(new Map(app.routes
	.filter((route) => WRITES.has(route.method) && route.path.startsWith("/api/"))
	.map((route) => {
		const path = route.path.replace(/:[^/]+/g, "x");
		return [`${route.method} ${path}`, { method: route.method, path, template: route.path }] as const;
	})).values());

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	// Anything that reaches a handler hits Supabase; answer "not signed in" so the route stops there.
	fetchMock = vi.fn(async () => Response.json({ message: "invalid token" }, { status: 401 }));
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function send(method: string, path: string, claims: Record<string, unknown>) {
	const response = await app.request(`https://phaseo.app${path}`, {
		method,
		headers: { authorization: `Bearer ${token(claims)}`, "content-type": "application/json" },
		...(method === "GET" ? {} : { body: "{}" }),
	}, env, executionCtx);
	return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe("web-api writes with an OAuth client's token", () => {
	it("knows a good number of write routes", () => {
		expect(writeRoutes.length).toBeGreaterThan(150);
	});

	it.each(["phaseo_cli", "phaseo_desktop"])("refuses %s on every write route that isn't allowlisted, before any handler runs", async (clientId) => {
		const refused: string[] = [];
		for (const route of writeRoutes) {
			fetchMock.mockClear();
			const { status, body } = await send(route.method, route.path, { client_id: clientId });
			const label = `${route.method} ${route.template}`;
			if (oauthClientMayWrite(route.method, route.path)) {
				expect(body?.reason, label).not.toBe("oauth_client_write_refused");
				continue;
			}
			expect(status, label).toBe(403);
			expect(body, label).toEqual({ error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL });
			expect(fetchMock, label).not.toHaveBeenCalled();
			refused.push(label);
		}
		// Platform-admin catalogue writes and preset, key, spending and destination writes are among them.
		expect(refused).toEqual(expect.arrayContaining([
			"POST /api/account/models", "PUT /api/account/models/:modelId/pricing-editor",
			"POST /api/account/settings/presets", "POST /api/account/settings/keys", "POST /api/account/settings/budgets",
			"PUT /api/account/settings/guardrails/global", "POST /api/account/settings/webhooks", "PUT /api/account/credits/auto-top-up",
			"POST /api/account/settings/teams/:workspaceId/invites", "POST /api/account/settings/teams/invites/accept",
			// A push device would keep receiving private alerts after the token is revoked.
			"PUT /api/account/settings/mobile-notifications/devices/:installationId", "POST /api/account/settings/mobile-notifications/rules",
		]));
	});

	it("allowlists only routes that exist", () => {
		const allowed = writeRoutes.filter((route) => oauthClientMayWrite(route.method, route.path)).map((route) => `${route.method} ${route.template}`);
		expect(allowed.sort()).toEqual([
			"DELETE /api/account/settings/authorized-apps/:authorizationId",
			"DELETE /api/account/settings/mobile-notifications/devices/:installationId",
			"DELETE /api/account/settings/teams/:workspaceId/logo",
			"PATCH /api/account/settings/authorized-apps/:authorizationId/scopes",
			"POST /api/account/auth/workspace-accessed",
			"POST /api/account/chat/issues",
			"POST /api/account/credits/redeem",
			"POST /api/account/settings/privacy/review",
			"POST /api/account/settings/profile/avatar",
			"POST /api/account/settings/provider-onboarding/preview",
			"POST /api/account/settings/teams",
			"POST /api/account/settings/teams/:workspaceId/logo",
			"POST /api/account/settings/usage/actions",
			"PUT /api/account/auth/onboarding",
			"PUT /api/account/settings/account/profile",
			"PUT /api/account/settings/beta",
			"PUT /api/account/settings/mobile-notifications",
			"PUT /api/account/settings/preferences",
			"PUT /api/account/settings/teams/:workspaceId",
		].sort());
	});

	it("leaves reads and the person's own session alone", async () => {
		expect(oauthClientMayWrite("GET", "/api/account/settings/presets")).toBe(true);
		const read = await send("GET", "/api/account/settings/keys", { client_id: "phaseo_cli" });
		expect(read.body?.reason).not.toBe("oauth_client_write_refused");
		for (const route of writeRoutes.slice(0, 40)) {
			const { body } = await send(route.method, route.path, {});
			expect(body?.reason, `${route.method} ${route.template}`).not.toBe("oauth_client_write_refused");
		}
	});
});
