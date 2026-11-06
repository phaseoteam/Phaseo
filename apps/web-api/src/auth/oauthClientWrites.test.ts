import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "@/env";
import { accountRouter } from "@/routes/account";
import { OAUTH_CLIENT_WRITE_REFUSAL, isSensitiveAccountWrite } from "./oauthClientWrites";

// Tokens the auth provider's OAuth server issues carry the client's client_id. Phaseo's CLI and desktop app use
// public client IDs, so their tokens get no exemption on account writes that change spending, access, where
// content goes, or what presets and routes run: those are made in the dashboard. Reads and other settings keep
// working for them.

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } as Env;
const app = new Hono<{ Bindings: Env }>().route("/api/account", accountRouter);

function token(claims: Record<string, unknown>) {
	const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", aal: "aal2", ...claims })}.signature`;
}

const WS = "00000000-0000-4000-8000-000000000010";
const ID = "00000000-0000-4000-8000-000000000001";
// One or more paths per category, as the dashboard calls them.
const SENSITIVE: Array<[string, string]> = [
	["POST", "/settings/presets"], ["PUT", `/settings/presets/${ID}`], ["POST", `/settings/presets/${ID}/versions`],
	["POST", `/settings/presets/${ID}/fork`], ["POST", `/settings/presets/${ID}/upstream`], ["PUT", `/settings/presets/${ID}/labels/prod`],
	["DELETE", `/settings/presets/${ID}/labels/prod`], ["DELETE", `/settings/presets/${ID}`],
	["PUT", "/settings/routing/auto"], ["PUT", "/settings/routing/successor/replacements"], ["POST", "/settings/dynamic-routes"],
	["PUT", `/settings/dynamic-routes/${ID}/keys`],
	["POST", "/settings/keys"], ["PUT", `/settings/keys/${ID}/limits`], ["POST", `/settings/keys/${ID}/rotate`], ["POST", "/settings/management-keys"],
	["POST", "/settings/key-security/bulk"], ["POST", "/settings/budgets"], ["PUT", "/settings/guardrails/global"], ["PATCH", "/settings/guardrails/assignments"],
	["POST", "/settings/rate-limits/tier/raise"], ["POST", "/settings/spend-rules"], ["POST", `/settings/spend-rules/blocks/${ID}/lift`],
	["POST", "/settings/trusted-workloads/policies"], ["POST", `/settings/teams/${WS}/invites`], ["PUT", `/settings/teams/${WS}/members/user-2`],
	["PUT", `/settings/teams/${WS}/sso`], ["POST", `/settings/teams/${WS}/scim/tokens`], ["PUT", "/credits/auto-top-up"],
	["POST", "/settings/broadcast"], ["PUT", `/settings/broadcast/${ID}/enable`], ["POST", "/settings/webhooks"], ["POST", `/settings/webhooks/${ID}/test`],
	["POST", "/settings/byok"], ["PUT", "/settings/byok-fallback"], ["POST", "/settings/classifiers"], ["PUT", "/settings/data-contribution"],
	["POST", "/settings/slack/install"], ["POST", "/credits/notification-destinations"], ["PUT", "/credits/notification-routes/low_balance"],
	["POST", "/private-models"], ["PATCH", `/private-models/${ID}`],
];
// Writes outside those categories, and reads, keep the token-acceptance exemption for Phaseo's own apps.
const ALLOWED: Array<[string, string]> = [
	["PUT", "/settings/account/profile"], ["PUT", "/settings/preferences"], ["PUT", "/settings/presets/publisher"], ["PUT", "/settings/routing"],
	["POST", "/settings/teams"], ["POST", "/settings/teams/invites/accept"], ["POST", "/credits/redeem"], ["PUT", "/auth/onboarding"],
	["GET", "/settings/presets"], ["GET", "/settings/keys"], ["GET", "/session"],
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	// Anything that reaches a handler hits Supabase; answer "not signed in" so the route stops there.
	fetchMock = vi.fn(async () => Response.json({ message: "invalid token" }, { status: 401 }));
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function send(method: string, path: string, claims: Record<string, unknown>) {
	const response = await app.request(`https://phaseo.app/api/account${path}`, {
		method,
		headers: { authorization: `Bearer ${token(claims)}`, "content-type": "application/json" },
		...(method === "GET" ? {} : { body: JSON.stringify({ workspaceId: WS }) }),
	}, env, { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as never);
	return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe("account writes with an OAuth client's token", () => {
	it.each(["phaseo_cli", "aistats_cli", "phaseo_desktop", "partner_app"])("refuses %s on every sensitive write, before any handler runs", async (clientId) => {
		for (const [method, path] of SENSITIVE) {
			fetchMock.mockClear();
			const { status, body } = await send(method, path, { client_id: clientId });
			expect(status, `${method} ${path}`).toBe(403);
			expect(body, `${method} ${path}`).toEqual({ error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL });
			expect(fetchMock, `${method} ${path}`).not.toHaveBeenCalled();
		}
	});

	it.each(["phaseo_cli", "phaseo_desktop"])("leaves %s reads and other settings to the usual checks", async (clientId) => {
		for (const [method, path] of ALLOWED) {
			const { body } = await send(method, path, { client_id: clientId });
			expect(body?.reason, `${method} ${path}`).not.toBe("oauth_client_write_refused");
		}
	});

	it("leaves the person's own session alone on the same writes", async () => {
		for (const [method, path] of SENSITIVE) {
			const { body } = await send(method, path, {});
			expect(body?.reason, `${method} ${path}`).not.toBe("oauth_client_write_refused");
		}
	});

	it("matches paths, not lookalikes", () => {
		expect(isSensitiveAccountWrite("PUT", "/api/account/settings/presets/publisher")).toBe(false);
		expect(isSensitiveAccountWrite("GET", "/api/account/settings/presets")).toBe(false);
		expect(isSensitiveAccountWrite("POST", "/api/account/settings/keysmith")).toBe(false);
		expect(isSensitiveAccountWrite("DELETE", "/api/account/settings/teams/invites/abc")).toBe(false);
		expect(isSensitiveAccountWrite("post", "/api/account/settings/keys")).toBe(true);
	});
});
