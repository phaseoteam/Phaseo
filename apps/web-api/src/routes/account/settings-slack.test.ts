import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import { SLACK_AGENT_BOT_SCOPES } from "@/lib/slack-api";
import { decryptSlackSecrets, encryptSlackSecrets, signSlackToken, verifySlackToken } from "@/lib/slack-secrets";
import { currentPeriodStart } from "./settings-slack";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000002";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000d1";
const KEY_ID = "00000000-0000-4000-8000-0000000000a1";
const GUARDRAIL_ID = "00000000-0000-4000-8000-0000000000b1";
const APP_ROW_ID = "00000000-0000-4000-8000-0000000000c1";
const BOT_TOKEN = "xoxb-1111-2222-bottokenvalue";
const env = {
	ENV: "production" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	SLACK_CLIENT_ID: "1111.2222",
	SLACK_CLIENT_SECRET: "hostedclientsecret0001",
	SLACK_STATE_SECRET: "state-secret-for-tests",
	SLACK_SECRETS_ENCRYPTION_KEY: "encryption-key-for-tests",
	PHASEO_CONTROL_KEY: "control-key",
	PHASEO_CONTROL_SECRET: "control-secret",
	GATEWAY_API_ORIGIN: "https://gateway-control.test",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;
const TOKENS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };

function installationRow(overrides: Record<string, unknown> = {}) {
	return {
		id: INSTALLATION_ID, workspace_id: WORKSPACE, slack_app_id: null, team_id: "T0TEAM0001", team_name: "Acme", enterprise_id: null,
		bot_user_id: "U0BOT0001", key_id: KEY_ID, guardrail_id: GUARDRAIL_ID, model: "phaseo/auto", instructions: null,
		access_mode: "everyone", usage_data_mode: "dm", usage_data_channel_ids: [], plan_people: 10, over_plan: "refuse",
		max_people: null, monthly_cap_nanos: 25_000_000_000, answers_per_person_hour: 60, allow_guests: true,
		allow_external_users: false, status: "active", installed_by: "user-a", installed_at: "2026-10-01T00:00:00Z",
		uninstalled_at: null, updated_at: "2026-10-01T00:00:00Z", ...overrides,
	};
}

function grant(overrides: Record<string, unknown> = {}) {
	return {
		ok: true, access_token: BOT_TOKEN, token_type: "bot", scope: SLACK_AGENT_BOT_SCOPES.join(","), bot_user_id: "U0BOT0001",
		app_id: "A0HOSTED01", team: { id: "T0TEAM0001", name: "Acme" }, enterprise: null, is_enterprise_install: false,
		authed_user: { id: "U0ADMIN001" }, ...overrides,
	};
}

type Recorded = { url: URL; method: string; body: any; headers: Headers };
type Fixture = {
	role?: string | null;
	reviewed?: boolean;
	installation?: Record<string, unknown> | null;
	teamRows?: Array<{ id: string; workspace_id: string }>;
	linkInstallation?: Record<string, unknown> | null;
	customApp?: Record<string, unknown> | null;
	appInUse?: boolean;
	keyLimitNanos?: number;
	usage?: { people: number; answers: number };
	charges?: Array<Record<string, unknown>>;
	installInsertError?: { status: number; body: Record<string, unknown> };
	installationUpdateRows?: Array<Record<string, unknown>>;
	slackAccess?: Record<string, unknown> | ((request: Request) => Response);
	slackUninstallOk?: boolean;
	keyById?: Record<string, unknown>;
	customAppInsertError?: { status: number; body: Record<string, unknown> };
};

function parse(text: string): any {
	if (!text) return null;
	try { return JSON.parse(text); } catch { return text; }
}

function database(fixture: Fixture = {}) {
	const requests: Recorded[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: parse(text), headers: request.headers });
		const path = url.pathname;
		const rows = (data: unknown[]) => Response.json(data);
		if (url.hostname === "slack.com") {
			if (path === "/api/oauth.v2.access") {
				if (typeof fixture.slackAccess === "function") return fixture.slackAccess(request);
				return Response.json(fixture.slackAccess ?? grant());
			}
			if (path === "/api/apps.uninstall") return Response.json({ ok: fixture.slackUninstallOk ?? true });
		}
		if (url.hostname === "gateway-control.test") return Response.json({ ok: true });
		if (path.endsWith("/auth/v1/user")) {
			const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
			const id = TOKENS[token];
			if (!id) return Response.json({ message: "invalid token" }, { status: 401 });
			return Response.json({
				id, email: `${id}@example.com`,
				app_metadata: fixture.reviewed === false ? {} : { chat_privacy_reviews: { [WORKSPACE]: CHAT_PRIVACY_REVIEW_VERSION } },
			});
		}
		if (path.endsWith("/workspace_members")) return rows(fixture.role === null ? [] : [{ role: fixture.role ?? "admin" }]);
		if (path.endsWith("/workspaces")) return rows([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (path.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
		if (path.endsWith("/rpc/get_slack_agent_month_usage")) return rows([fixture.usage ?? { people: 0, answers: 0 }]);
		if (path.endsWith("/slack_agent_charges")) return rows(fixture.charges ?? []);
		if (path.endsWith("/slack_user_links")) return new Response(null, { status: 201 });
		if (path.endsWith("/workspace_member_guardrails")) return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
		if (path.endsWith("/key_guardrails")) {
			if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
			return new Response(null, { status: request.method === "POST" ? 201 : 204 });
		}
		if (path.endsWith("/workspace_guardrails")) {
			if (request.method === "POST") return rows([{ id: GUARDRAIL_ID }]);
			return new Response(null, { status: 204 });
		}
		if (path.endsWith("/keys")) {
			if (request.method === "POST") return rows([{ id: KEY_ID }]);
			if (request.method === "PATCH") return rows([{ id: KEY_ID }]);
			if (request.method === "DELETE") return new Response(null, { status: 204 });
			if (url.searchParams.get("id") === `eq.${KEY_ID}` && fixture.keyById) return rows([fixture.keyById]);
			return rows([{ monthly_limit_cost_nanos: fixture.keyLimitNanos ?? 0 }]);
		}
		if (path.endsWith("/slack_apps")) {
			if (request.method === "GET") return rows(fixture.customApp ? [fixture.customApp] : []);
			if (request.method === "DELETE") return new Response(null, { status: 204 });
			if (request.method === "POST" && fixture.customAppInsertError) {
				return Response.json(fixture.customAppInsertError.body, { status: fixture.customAppInsertError.status });
			}
			const body = parse(text);
			return rows([{ id: APP_ROW_ID, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...body }]);
		}
		if (path.endsWith("/slack_installations")) {
			if (request.method === "POST") {
				if (fixture.installInsertError) return Response.json(fixture.installInsertError.body, { status: fixture.installInsertError.status });
				return rows([{ id: INSTALLATION_ID }]);
			}
			if (request.method === "PATCH") {
				if (fixture.installationUpdateRows) return rows(fixture.installationUpdateRows);
				return rows([{ ...installationRow(fixture.installation ?? {}), ...parse(text) }]);
			}
			if (url.searchParams.has("team_id") || url.searchParams.has("enterprise_id")) return rows(fixture.teamRows ?? []);
			if (url.searchParams.has("slack_app_id")) return rows(fixture.appInUse ? [{ id: INSTALLATION_ID }] : []);
			if (url.searchParams.has("id")) return rows(fixture.linkInstallation ? [fixture.linkInstallation] : []);
			return rows(fixture.installation ? [installationRow(fixture.installation)] : []);
		}
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}${url.search}`);
	}));
	return requests;
}

function call(path: string, init: RequestInit = {}, token = "token-a", overrides: Record<string, unknown> = {}) {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
	}, { ...env, ...overrides }, executionCtx);
}

function sessionCookie(accessToken: string) {
	return `sb-example-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: accessToken, refresh_token: "r" })).toString("base64url")}`;
}

function callback(query: Record<string, string>, cookieToken: string | null = "token-a", overrides: Record<string, unknown> = {}) {
	const search = new URLSearchParams(query).toString();
	return app.request(`https://phaseo.app/api/account/settings/slack/oauth/callback?${search}`, {
		headers: cookieToken ? { cookie: `theme=dark; ${sessionCookie(cookieToken)}` } : {},
	}, { ...env, ...overrides }, executionCtx);
}

const validInstall = { workspaceId: WORKSPACE, plan_people: 10, over_plan: "refuse", monthly_cap_usd: 25, token_monthly_limit_usd: 40, model: "phaseo/auto", access_mode: "everyone", usage_data_mode: "dm" };

async function installState(overrides: Record<string, unknown> = {}, now = Date.now()) {
	const { workspaceId: _ignored, ...settings } = validInstall;
	return signSlackToken(env as never, "install", {
		workspace_id: WORKSPACE, user_id: "user-a",
		settings: { ...settings, max_people: null, slack_app_id: null, ...overrides },
	}, 600, now);
}

const find = (requests: Recorded[], method: string, suffix: string) =>
	requests.filter((entry) => entry.method === method && entry.url.pathname.endsWith(suffix));

function location(response: Response) {
	return new URL(response.headers.get("location") ?? "");
}

afterEach(() => vi.unstubAllGlobals());

describe("Slack agent settings reads", () => {
	it("tells members whether the agent is installed, and nothing about its setup", async () => {
		const requests = database({ role: "member", installation: {} });
		const response = await call(`/slack?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		const body = await response.json() as any;
		expect(body).toEqual({
			workspaceId: WORKSPACE, canManage: false, installed: true,
			installation: { team_name: "Acme", status: "active", installed_at: "2026-10-01T00:00:00Z" },
		});
		expect(find(requests, "POST", "/rpc/get_slack_agent_month_usage")).toHaveLength(0);
		expect(find(requests, "GET", "/slack_agent_charges")).toHaveLength(0);
	});

	it("rejects people outside the workspace", async () => {
		database({ role: null });
		expect((await call(`/slack?workspaceId=${WORKSPACE}`)).status).toBe(403);
	});

	it("shows admins the settings, plan price, this month's usage from the database and recent charges, without secrets", async () => {
		const requests = database({
			role: "admin", installation: {}, keyLimitNanos: 40_000_000_000, usage: { people: 4, answers: 1_500 },
			charges: [{ period_start: "2026-09-01", people: 3, answers: 200, amount_nanos: 990_000_000, status: "charged", charged_at: "2026-10-01T01:00:00Z" }],
		});
		const response = await call(`/slack?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.canManage).toBe(true);
		expect(body.redirect_url).toBe("https://phaseo.app/api/account/settings/slack/oauth/callback");
		expect(body.configured).toEqual({ hosted_app: true, custom_app: true });
		expect(body.installation.settings).toMatchObject({ plan_people: 10, monthly_cap_usd: 25, token_monthly_limit_usd: 40, over_plan: "refuse" });
		expect(body.installation.plan).toEqual({ people: 10, price_usd: 2.99 });
		// 4 people: the 10-person plan ($2.99) and 1,200 included answers, so 300 extra at $0.25 per 1,000.
		expect(body.installation.month).toEqual({ period_start: currentPeriodStart(), people: 4, answers: 1_500, estimated_charge_usd: 3.065 });
		expect(body.charges).toEqual([{ period_start: "2026-09-01", people: 3, answers: 200, amount_usd: 0.99, status: "charged", charged_at: "2026-10-01T01:00:00Z" }]);
		const rpc = find(requests, "POST", "/rpc/get_slack_agent_month_usage")[0];
		expect(rpc.body).toEqual({ p_installation_id: INSTALLATION_ID, p_period_start: currentPeriodStart() });
		// Usage is never read row by row, and secrets are never selected or returned.
		expect(find(requests, "GET", "/slack_agent_monthly_people")).toHaveLength(0);
		for (const entry of find(requests, "GET", "/slack_installations")) expect(entry.url.searchParams.get("select")).not.toContain("secrets");
		expect(JSON.stringify(body)).not.toMatch(/secret|ciphertext|xox/);
	});
});

describe("Slack agent install", () => {
	it("is for admins only", async () => {
		const requests = database({ role: "member" });
		const response = await call("/slack/install", { method: "POST", body: JSON.stringify(validInstall) });
		expect(response.status).toBe(403);
		expect(find(requests, "GET", "/slack_installations")).toHaveLength(0);
	});

	it("requires the Chat privacy review, with Chat's error", async () => {
		database({ role: "admin", reviewed: false });
		const response = await call("/slack/install", { method: "POST", body: JSON.stringify(validInstall) });
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "chat_privacy_review_required" });
	});

	it("refuses a second live installation", async () => {
		database({ role: "admin", installation: {} });
		const response = await call("/slack/install", { method: "POST", body: JSON.stringify(validInstall) });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "already_installed" });
	});

	it("returns 503 until the hosted app and secrets are configured", async () => {
		for (const missing of ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_STATE_SECRET", "SLACK_SECRETS_ENCRYPTION_KEY"]) {
			database({ role: "admin" });
			const response = await call("/slack/install", { method: "POST", body: JSON.stringify(validInstall) }, "token-a", { [missing]: undefined });
			expect(response.status, missing).toBe(503);
			expect(await response.json()).toMatchObject({ error: "slack_not_configured" });
		}
	});

	it("validates the settings", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ plan_people: 7 }, "plan_people must be 3, 10, 25, 50, 100"],
			[{ plan_people: 100.5 }, "plan_people"],
			[{ over_plan: "always" }, "over_plan must be one of"],
			[{ monthly_cap_usd: undefined }, "monthly_cap_usd is required"],
			[{ monthly_cap_usd: 0 }, "monthly_cap_usd must be more than 0"],
			[{ monthly_cap_usd: 1_000_000 }, "up to 100,000"],
			[{ monthly_cap_usd: 1 }, "at least the plan's price ($2.99)"],
			[{ max_people: 5 }, "max_people must be at least plan_people"],
			[{ token_monthly_limit_usd: -1 }, "token_monthly_limit_usd"],
			[{ model: "" }, "model must be a model id"],
			[{ access_mode: "anyone" }, "access_mode"],
			[{ usage_data_mode: "all" }, "usage_data_mode"],
			[{ slack_app_id: "A0123" }, "slack_app_id"],
			[{ workspace_id: OTHER_WORKSPACE }, "Unknown field: workspace_id"],
		];
		for (const [change, message] of cases) {
			const requests = database({ role: "admin" });
			const response = await call("/slack/install", { method: "POST", body: JSON.stringify({ ...validInstall, ...change }) });
			expect(response.status, JSON.stringify(change)).toBe(400);
			expect(((await response.json()) as any).message).toContain(message);
			expect(find(requests, "GET", "/slack_installations")).toHaveLength(0);
		}
	});

	it("returns Slack's authorize URL with the bot scopes, the redirect and a signed 10-minute state", async () => {
		database({ role: "admin" });
		const before = Math.floor(Date.now() / 1000);
		const response = await call("/slack/install", { method: "POST", body: JSON.stringify({ ...validInstall, plan_people: 250, monthly_cap_usd: 60, over_plan: "move_up", max_people: 400 }) });
		expect(response.status).toBe(200);
		const url = new URL(((await response.json()) as any).url);
		expect(`${url.origin}${url.pathname}`).toBe("https://slack.com/oauth/v2/authorize");
		expect(url.searchParams.get("client_id")).toBe("1111.2222");
		expect(url.searchParams.get("scope")).toBe("app_mentions:read,assistant:write,chat:write,im:history,channels:history,groups:history,users:read,files:read,search:read.public");
		expect(url.searchParams.get("redirect_uri")).toBe("https://phaseo.app/api/account/settings/slack/oauth/callback");
		const state = url.searchParams.get("state")!;
		expect(state.length).toBeLessThan(1_000);
		const verified = await verifySlackToken(env as never, "install", state);
		expect(verified.ok).toBe(true);
		if (verified.ok) {
			expect(verified.payload).toMatchObject({
				workspace_id: WORKSPACE, user_id: "user-a",
				settings: { plan_people: 250, over_plan: "move_up", max_people: 400, monthly_cap_usd: 60, token_monthly_limit_usd: 40, model: "phaseo/auto", slack_app_id: null },
			});
			expect(verified.payload.exp - before).toBeGreaterThanOrEqual(599);
			expect(verified.payload.exp - before).toBeLessThanOrEqual(601);
		}
	});

	it("uses the workspace's own Slack app when one is chosen, even without the hosted app", async () => {
		database({ role: "admin", customApp: { id: APP_ROW_ID, client_id: "9999.8888" } });
		const response = await call("/slack/install", { method: "POST", body: JSON.stringify({ ...validInstall, slack_app_id: APP_ROW_ID }) }, "token-a", { SLACK_CLIENT_ID: undefined, SLACK_CLIENT_SECRET: undefined });
		expect(response.status).toBe(200);
		expect(new URL(((await response.json()) as any).url).searchParams.get("client_id")).toBe("9999.8888");
		database({ role: "admin", customApp: null });
		const missing = await call("/slack/install", { method: "POST", body: JSON.stringify({ ...validInstall, slack_app_id: APP_ROW_ID }) });
		expect(missing.status).toBe(404);
	});
});

describe("Slack OAuth callback", () => {
	it("redirects with an error for a bad, tampered or expired state, before calling Slack", async () => {
		const requests = database({ role: "admin" });
		const good = await installState();
		const expired = await installState({}, Date.now() - 11 * 60_000);
		const [payload, signature] = good.split(".");
		const cases: Array<[Record<string, string>, string]> = [
			[{ code: "123.456.abc" }, "state_invalid"],
			[{ code: "123.456.abc", state: "nonsense" }, "state_invalid"],
			[{ code: "123.456.abc", state: `${payload}x.${signature}` }, "state_invalid"],
			[{ code: "123.456.abc", state: expired }, "state_expired"],
			[{ code: "123.456.abc", state: await signSlackToken(env as never, "link", { workspace_id: WORKSPACE }, 600) }, "state_invalid"],
			[{ error: "access_denied", state: good }, "slack_denied"],
			[{ state: good }, "slack_code_missing"],
		];
		for (const [query, error] of cases) {
			const response = await callback(query);
			expect(response.status).toBe(302);
			expect(response.headers.get("cache-control")).toContain("no-store");
			const target = location(response);
			expect(`${target.origin}${target.pathname}`).toBe("https://phaseo.app/settings/slack");
			expect(target.searchParams.get("error"), JSON.stringify(query)).toBe(error);
		}
		expect(requests.some((entry) => entry.url.hostname === "slack.com")).toBe(false);
	});

	it("binds the install to the browser's signed-in user", async () => {
		const requests = database({ role: "admin" });
		const state = await installState();
		expect(location(await callback({ code: "123.456.abc", state }, null)).searchParams.get("error")).toBe("sign_in_required");
		expect(location(await callback({ code: "123.456.abc", state }, "expired-token")).searchParams.get("error")).toBe("sign_in_required");
		expect(location(await callback({ code: "123.456.abc", state }, "token-b")).searchParams.get("error")).toBe("session_mismatch");
		expect(requests.some((entry) => entry.url.hostname === "slack.com")).toBe(false);
		expect(find(requests, "POST", "/keys")).toHaveLength(0);
	});

	it("installs: managed key, no-training no-logging guardrail, key link and encrypted installation", async () => {
		const requests = database({ role: "admin" });
		const response = await callback({ code: "123.456.abc", state: await installState() });
		expect(response.status).toBe(302);
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		const target = location(response);
		expect(target.pathname).toBe("/settings/slack");
		expect(target.searchParams.get("installed")).toBe("1");
		expect(target.searchParams.get("error")).toBeNull();

		const exchange = requests.find((entry) => entry.url.href === "https://slack.com/api/oauth.v2.access")!;
		expect(exchange.method).toBe("POST");
		expect(exchange.headers.get("authorization")).toBe(`Basic ${btoa("1111.2222:hostedclientsecret0001")}`);
		expect(new URLSearchParams(exchange.body)).toEqual(new URLSearchParams({ code: "123.456.abc", redirect_uri: "https://phaseo.app/api/account/settings/slack/oauth/callback" }));

		const key = find(requests, "POST", "/keys")[0].body;
		expect(key).toMatchObject({
			workspace_id: WORKSPACE, name: "__slack_agent_managed_key__", status: "active", created_by: "user-a",
			monthly_limit_cost_nanos: 40_000_000_000, daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0,
			never_store_content: true,
		});
		expect(key.kid).toMatch(/^[A-Za-z0-9]{12}$/);
		expect(key.hash).toMatch(/^[0-9a-f]{64}$/);

		const guardrail = find(requests, "POST", "/workspace_guardrails")[0].body;
		expect(guardrail).toMatchObject({
			workspace_id: WORKSPACE, name: "Slack agent", enabled: true,
			privacy_enable_paid_may_train: false, privacy_enable_free_may_train: false,
			privacy_enable_free_may_publish_prompts: false, privacy_enable_input_output_logging: false,
		});
		expect(find(requests, "POST", "/key_guardrails")[0].body).toEqual({ key_id: KEY_ID, guardrail_id: GUARDRAIL_ID });

		const installation = find(requests, "POST", "/slack_installations")[0].body;
		expect(installation).toMatchObject({
			workspace_id: WORKSPACE, slack_app_id: null, team_id: "T0TEAM0001", team_name: "Acme", enterprise_id: null,
			bot_user_id: "U0BOT0001", key_id: KEY_ID, guardrail_id: GUARDRAIL_ID, model: "phaseo/auto", access_mode: "everyone",
			usage_data_mode: "dm", plan_people: 10, over_plan: "refuse", max_people: null, monthly_cap_nanos: 25_000_000_000, installed_by: "user-a",
		});
		const secrets = await decryptSlackSecrets(env as never, installation.secrets_ciphertext);
		expect(secrets).toEqual({ bot_token: BOT_TOKEN, gateway_key: expect.stringMatching(new RegExp(`^phaseo_v1_sk_${key.kid}_[A-Za-z0-9]{40}$`)) });
		// Neither the bot token nor the gateway key is stored or logged in the clear.
		const stored = requests.filter((entry) => entry.url.hostname !== "slack.com").map((entry) => JSON.stringify(entry.body ?? "")).join("\n");
		expect(stored).not.toContain(BOT_TOKEN);
		expect(stored).not.toContain(secrets.gateway_key);

		const audit = find(requests, "POST", "/workspace_audit_events")[0].body;
		expect(audit).toMatchObject({ workspace_id: WORKSPACE, actor_user_id: "user-a", action: "slack_agent.installed", target_id: INSTALLATION_ID, target_name: "Acme" });
		expect(audit.metadata).toMatchObject({ team_id: "T0TEAM0001", plan_people: 10, monthly_cap_usd: 25, key_monthly_limit_usd: 40 });
	});

	it("refuses a Slack team that is live in another Phaseo workspace, without creating anything", async () => {
		const requests = database({ role: "admin", teamRows: [{ id: "other", workspace_id: OTHER_WORKSPACE }] });
		const response = await callback({ code: "123.456.abc", state: await installState() });
		expect(location(response).searchParams.get("error")).toBe("slack_team_in_use");
		const lookup = requests.find((entry) => entry.method === "GET" && entry.url.searchParams.get("team_id") === "eq.T0TEAM0001")!;
		expect(lookup.url.searchParams.get("status")).toBe("neq.uninstalled");
		expect(find(requests, "POST", "/keys")).toHaveLength(0);
		expect(find(requests, "POST", "/slack_installations")).toHaveLength(0);
		// The bot token is not revoked: it can be the one the other installation uses.
		expect(requests.some((entry) => entry.url.pathname === "/api/apps.uninstall")).toBe(false);
	});

	it("does not use the code again once the workspace has a live installation", async () => {
		const requests = database({ role: "admin", installation: {} });
		expect(location(await callback({ code: "123.456.abc", state: await installState() })).searchParams.get("error")).toBe("already_installed");
		expect(requests.some((entry) => entry.url.hostname === "slack.com")).toBe(false);
	});

	it("removes the key and guardrail it created when a later step fails", async () => {
		for (const [error, expected] of [
			[{ status: 500, body: { code: "XX000", message: "boom" } }, "install_failed"],
			[{ status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint \"slack_installations_live_workspace_idx\"" } }, "already_installed"],
			[{ status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint \"slack_installations_live_team_idx\"" } }, "slack_team_in_use"],
		] as const) {
			const requests = database({ role: "admin", installInsertError: error });
			const response = await callback({ code: "123.456.abc", state: await installState() });
			expect(location(response).searchParams.get("error")).toBe(expected);
			const guardrailDelete = find(requests, "DELETE", "/workspace_guardrails")[0];
			expect(guardrailDelete.url.searchParams.get("id")).toBe(`eq.${GUARDRAIL_ID}`);
			const keyDelete = find(requests, "DELETE", "/keys")[0];
			expect(keyDelete.url.searchParams.get("id")).toBe(`eq.${KEY_ID}`);
			expect(keyDelete.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
			expect(find(requests, "POST", "/workspace_audit_events")).toHaveLength(0);
		}
	});

	it("never passes Slack's errors through, and checks what Slack returned", async () => {
		const cases: Array<[Fixture["slackAccess"], string]> = [
			[{ ok: false, error: "invalid_code" }, "slack_exchange_failed"],
			[() => new Response("bad gateway", { status: 502 }), "slack_exchange_failed"],
			[grant({ bot_user_id: undefined }), "slack_response_invalid"],
			[grant({ token_type: "user" }), "slack_response_invalid"],
			[grant({ access_token: "xoxp-user-token-0000" }), "slack_response_invalid"],
			[grant({ team: null, enterprise: null }), "slack_response_invalid"],
			[grant({ team: { id: "not-a-team" } }), "slack_response_invalid"],
		];
		for (const [slackAccess, expected] of cases) {
			const requests = database({ role: "admin", slackAccess });
			const target = location(await callback({ code: "123.456.abc", state: await installState() }));
			expect(target.searchParams.get("error")).toBe(expected);
			expect(target.search).not.toContain("invalid_code");
			expect(find(requests, "POST", "/keys")).toHaveLength(0);
		}
	});

	it("installs an org-wide (Enterprise Grid) app by its enterprise id", async () => {
		const requests = database({ role: "admin", slackAccess: grant({ team: null, enterprise: { id: "E0ORG00001", name: "Acme Org" }, is_enterprise_install: true }) });
		expect(location(await callback({ code: "123.456.abc", state: await installState() })).searchParams.get("installed")).toBe("1");
		const lookup = requests.find((entry) => entry.method === "GET" && entry.url.searchParams.get("enterprise_id") === "eq.E0ORG00001")!;
		expect(lookup.url.searchParams.get("team_id")).toBe("is.null");
		expect(find(requests, "POST", "/slack_installations")[0].body).toMatchObject({ team_id: null, enterprise_id: "E0ORG00001", team_name: "Acme Org" });
	});

	it("uses a workspace's own app credentials and requires Slack to have installed that app", async () => {
		const secrets_ciphertext = await encryptSlackSecrets(env as never, { client_secret: "customclientsecret0001", signing_secret: "customsigningsecret001" });
		const customApp = { id: APP_ROW_ID, slack_app_id: "A0CUSTOM01", client_id: "9999.8888", secrets_ciphertext };
		const mismatch = database({ role: "admin", customApp, slackAccess: grant({ app_id: "A0HOSTED01" }) });
		expect(location(await callback({ code: "123.456.abc", state: await installState({ slack_app_id: APP_ROW_ID }) })).searchParams.get("error")).toBe("slack_response_invalid");
		expect(find(mismatch, "POST", "/keys")).toHaveLength(0);

		const requests = database({ role: "admin", customApp, slackAccess: grant({ app_id: "A0CUSTOM01" }) });
		const response = await callback({ code: "123.456.abc", state: await installState({ slack_app_id: APP_ROW_ID }) }, "token-a", { SLACK_CLIENT_ID: undefined, SLACK_CLIENT_SECRET: undefined });
		expect(location(response).searchParams.get("installed")).toBe("1");
		const exchange = requests.find((entry) => entry.url.pathname === "/api/oauth.v2.access")!;
		expect(exchange.headers.get("authorization")).toBe(`Basic ${btoa("9999.8888:customclientsecret0001")}`);
		expect(find(requests, "POST", "/slack_installations")[0].body.slack_app_id).toBe(APP_ROW_ID);
	});
});

describe("Slack agent settings changes", () => {
	const patch = (body: Record<string, unknown>, token = "token-a") =>
		call("/slack", { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, ...body }) }, token);

	it("validates fields and rejects unknown ones", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ status: "payment_due" }, "status must be one of: active, paused"],
			[{ status: "uninstalled" }, "status must be one of"],
			[{ answers_per_person_hour: 0 }, "answers_per_person_hour"],
			[{ answers_per_person_hour: 10_001 }, "answers_per_person_hour"],
			[{ instructions: "x".repeat(8_001) }, "at most 8,000 characters"],
			[{ usage_data_channel_ids: ["general"] }, "Slack channel ids"],
			[{ usage_data_channel_ids: Array.from({ length: 101 }, (_, index) => `C0${String(index).padStart(6, "0")}`) }, "at most 100"],
			[{ allow_guests: "yes" }, "allow_guests must be true or false"],
			[{ monthly_cap_usd: -5 }, "monthly_cap_usd"],
			[{ secrets_ciphertext: "x" }, "Unknown field: secrets_ciphertext"],
			[{}, "Provide at least one setting"],
		];
		for (const [body, message] of cases) {
			const requests = database({ role: "admin", installation: {} });
			const response = await patch(body);
			expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
			expect(((await response.json()) as any).message).toContain(message);
			expect(find(requests, "PATCH", "/slack_installations")).toHaveLength(0);
		}
	});

	it("checks the plan, hard limit and cap together with the saved values", async () => {
		database({ role: "admin", installation: { monthly_cap_nanos: 5_000_000_000 } });
		const response = await patch({ plan_people: 100 });
		expect(response.status).toBe(400);
		expect(((await response.json()) as any).message).toContain("at least the plan's price ($14.99)");
		database({ role: "admin", installation: { max_people: 20 } });
		expect((await patch({ plan_people: 25 })).status).toBe(400);
	});

	it("saves settings in storage units and records the changed field names", async () => {
		const requests = database({ role: "admin", installation: {} });
		const response = await patch({
			instructions: "  Answer briefly.  ", answers_per_person_hour: 30, usage_data_mode: "dm_and_channels",
			usage_data_channel_ids: ["C0AAAAAAA", "G0BBBBBBB", "C0AAAAAAA"], monthly_cap_usd: 12.5, allow_external_users: true,
		});
		expect(response.status).toBe(200);
		const update = find(requests, "PATCH", "/slack_installations")[0];
		expect(update.body).toEqual({
			instructions: "Answer briefly.", answers_per_person_hour: 30, usage_data_mode: "dm_and_channels",
			usage_data_channel_ids: ["C0AAAAAAA", "G0BBBBBBB"], monthly_cap_nanos: 12_500_000_000, allow_external_users: true,
		});
		expect(update.url.searchParams.get("status")).toBe("neq.uninstalled");
		expect(((await response.json()) as any).installation.settings).toMatchObject({ monthly_cap_usd: 12.5, usage_data_channel_ids: ["C0AAAAAAA", "G0BBBBBBB"] });
		const audit = find(requests, "POST", "/workspace_audit_events")[0].body;
		expect(audit.action).toBe("slack_agent.updated");
		expect(audit.metadata.changed_fields.sort()).toEqual(["allow_external_users", "answers_per_person_hour", "instructions", "monthly_cap_usd", "usage_data_channel_ids", "usage_data_mode"]);
		expect(JSON.stringify(audit)).not.toContain("Answer briefly");
	});

	it("updates the key's monthly limit and invalidates it in the gateway", async () => {
		const requests = database({ role: "admin", installation: {} });
		const response = await patch({ token_monthly_limit_usd: 15 });
		expect(response.status).toBe(200);
		const keyUpdate = find(requests, "PATCH", "/keys")[0];
		expect(keyUpdate.body).toEqual({ monthly_limit_cost_nanos: 15_000_000_000 });
		expect(keyUpdate.url.searchParams.get("id")).toBe(`eq.${KEY_ID}`);
		expect(keyUpdate.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(requests.some((entry) => entry.url.href === `https://gateway-control.test/v1/keys/${KEY_ID}/invalidate`)).toBe(true);
		expect(find(requests, "PATCH", "/slack_installations")).toHaveLength(0);
		expect(((await response.json()) as any).installation.settings.token_monthly_limit_usd).toBe(15);
		// 0 removes the key limit.
		database({ role: "admin", installation: {} });
		expect((await patch({ token_monthly_limit_usd: 0 })).status).toBe(200);
	});

	it("pauses and resumes, but only paying clears payment_due", async () => {
		const requests = database({ role: "admin", installation: {} });
		expect((await patch({ status: "paused" })).status).toBe(200);
		const pause = find(requests, "PATCH", "/slack_installations")[0];
		expect(pause.body).toEqual({ status: "paused" });
		expect(pause.url.searchParams.get("status")).toBe("in.(active,paused)");

		for (const status of ["active", "paused"]) {
			const due = database({ role: "admin", installation: { status: "payment_due" } });
			const response = await patch({ status });
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ error: "payment_due" });
			expect(find(due, "PATCH", "/slack_installations")).toHaveLength(0);
		}
		// Other settings can still change while payment is due.
		database({ role: "admin", installation: { status: "payment_due" } });
		expect((await patch({ model: "openai/gpt-5" })).status).toBe(200);
		// If the month-end charge set payment_due meanwhile, the guarded update matches nothing.
		database({ role: "admin", installation: {}, installationUpdateRows: [] });
		expect((await patch({ status: "active" })).status).toBe(409);
	});

	it("is for admins, and 404s without an installation", async () => {
		database({ role: "member", installation: {} });
		expect((await patch({ status: "paused" })).status).toBe(403);
		database({ role: "admin", installation: null });
		expect((await patch({ status: "paused" })).status).toBe(404);
	});
});

describe("Slack agent uninstall", () => {
	it("uninstalls from Slack, disables the key, keeps the row and records it", async () => {
		const secrets_ciphertext = await encryptSlackSecrets(env as never, { bot_token: BOT_TOKEN, gateway_key: "phaseo_v1_sk_kid_secret" });
		const requests = database({ role: "admin", installation: { secrets_ciphertext } });
		const response = await call("/slack", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ uninstalled: true, slack_uninstalled: true });

		const uninstall = requests.find((entry) => entry.url.href === "https://slack.com/api/apps.uninstall")!;
		expect(uninstall.headers.get("authorization")).toBe(`Bearer ${BOT_TOKEN}`);
		expect(new URLSearchParams(uninstall.body)).toEqual(new URLSearchParams({ client_id: "1111.2222", client_secret: "hostedclientsecret0001" }));

		const key = find(requests, "PATCH", "/keys")[0];
		expect(key.body).toMatchObject({ status: "deleted", soft_blocked: true, hash: `deleted:${KEY_ID}` });
		expect(key.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(requests.some((entry) => entry.url.href === `https://gateway-control.test/v1/keys/${KEY_ID}/invalidate`)).toBe(true);

		const installation = find(requests, "PATCH", "/slack_installations")[0];
		expect(installation.body).toMatchObject({ status: "uninstalled", uninstalled_at: expect.any(String) });
		expect(find(requests, "DELETE", "/slack_installations")).toHaveLength(0);
		// The unused agent guardrail goes too.
		expect(find(requests, "DELETE", "/workspace_guardrails")[0].url.searchParams.get("id")).toBe(`eq.${GUARDRAIL_ID}`);
		expect(find(requests, "POST", "/workspace_audit_events")[0].body).toMatchObject({ action: "slack_agent.uninstalled", metadata: { slack_uninstalled: true } });
	});

	it("still uninstalls in Phaseo when Slack refuses", async () => {
		const secrets_ciphertext = await encryptSlackSecrets(env as never, { bot_token: BOT_TOKEN, gateway_key: "k" });
		const requests = database({ role: "admin", installation: { secrets_ciphertext }, slackUninstallOk: false });
		const response = await call(`/slack?workspaceId=${WORKSPACE}`, { method: "DELETE" });
		expect(await response.json()).toEqual({ uninstalled: true, slack_uninstalled: false });
		expect(find(requests, "PATCH", "/slack_installations")).toHaveLength(1);
	});

	it("is for admins only", async () => {
		const requests = database({ role: "member", installation: {} });
		expect((await call("/slack", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(403);
		expect(requests.some((entry) => entry.method === "PATCH")).toBe(false);
	});
});

describe("A workspace's own Slack app", () => {
	const app = { workspaceId: WORKSPACE, slack_app_id: "A0CUSTOM01", client_id: "9999.8888", client_secret: "customclientsecret0001", signing_secret: "customsigningsecret001" };

	it("stores the secrets encrypted and never returns them", async () => {
		const requests = database({ role: "admin", customApp: null });
		const response = await call("/slack/custom-app", { method: "PUT", body: JSON.stringify(app) });
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body.custom_app).toMatchObject({ id: APP_ROW_ID, slack_app_id: "A0CUSTOM01", client_id: "9999.8888" });
		expect(JSON.stringify(body)).not.toMatch(/secret/i);
		const insert = find(requests, "POST", "/slack_apps")[0];
		expect(insert.url.searchParams.get("select")).not.toContain("secrets");
		expect(JSON.stringify(insert.body)).not.toContain("customclientsecret0001");
		await expect(decryptSlackSecrets(env as never, insert.body.secrets_ciphertext)).resolves.toEqual({ client_secret: "customclientsecret0001", signing_secret: "customsigningsecret001" });
	});

	it("tells a second admin saving at the same moment to reload, and keeps apps to one per workspace", async () => {
		for (const [constraint, error] of [["slack_apps_workspace_idx", "slack_app_conflict"], ["slack_apps_slack_app_id_idx", "slack_app_taken"]]) {
			database({
				role: "admin", customApp: null,
				customAppInsertError: { status: 409, body: { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` } },
			});
			const response = await call("/slack/custom-app", { method: "PUT", body: JSON.stringify(app) });
			expect(response.status, constraint).toBe(409);
			expect(((await response.json()) as any).error, constraint).toBe(error);
		}
	});

	it("validates the app details", async () => {
		for (const change of [{ slack_app_id: "B0123" }, { slack_app_id: "a0custom01" }, { client_id: "abc" }, { client_secret: "short" }, { signing_secret: "has spaces in it!!" }, { extra: 1 }]) {
			database({ role: "admin" });
			expect((await call("/slack/custom-app", { method: "PUT", body: JSON.stringify({ ...app, ...change }) })).status, JSON.stringify(change)).toBe(400);
		}
	});

	it("lets the secrets change while installed, but not the app", async () => {
		const saved = { id: APP_ROW_ID, slack_app_id: "A0CUSTOM01", client_id: "9999.8888", created_at: "x", updated_at: "x" };
		database({ role: "admin", customApp: saved, appInUse: true });
		expect((await call("/slack/custom-app", { method: "PUT", body: JSON.stringify({ ...app, client_secret: "rotatedclientsecret01" }) })).status).toBe(200);
		database({ role: "admin", customApp: saved, appInUse: true });
		const switched = await call("/slack/custom-app", { method: "PUT", body: JSON.stringify({ ...app, slack_app_id: "A0OTHER001" }) });
		expect(switched.status).toBe(409);
	});

	it("refuses to delete an app a live installation uses, and keeps billing history otherwise", async () => {
		const saved = { id: APP_ROW_ID, slack_app_id: "A0CUSTOM01", client_id: "9999.8888", created_at: "x", updated_at: "x" };
		const inUse = database({ role: "admin", customApp: saved, appInUse: true });
		expect((await call("/slack/custom-app", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(409);
		expect(find(inUse, "DELETE", "/slack_apps")).toHaveLength(0);

		const requests = database({ role: "admin", customApp: saved, appInUse: false });
		expect((await call("/slack/custom-app", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(200);
		const detach = find(requests, "PATCH", "/slack_installations")[0];
		expect(detach.body).toEqual({ slack_app_id: null });
		expect(detach.url.searchParams.get("status")).toBe("eq.uninstalled");
		const order = requests.map((entry) => `${entry.method} ${entry.url.pathname}`);
		expect(order.indexOf("PATCH /rest/v1/slack_installations")).toBeLessThan(order.indexOf("DELETE /rest/v1/slack_apps"));
	});
});

describe("Linking a Slack person to a Phaseo account", () => {
	const linkToken = (overrides: Record<string, unknown> = {}, now = Date.now()) =>
		signSlackToken(env as never, "link", { installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", ...overrides }, 900, now);
	const link = async (token: string, bearer = "token-a") => call("/slack/link", { method: "POST", body: JSON.stringify({ token }) }, bearer);
	const live = { id: INSTALLATION_ID, workspace_id: WORKSPACE, team_name: "Acme", status: "active" };

	it("links a member of the installation's workspace", async () => {
		const requests = database({ role: "member", linkInstallation: live });
		const response = await link(await linkToken());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ linked: true, workspaceId: WORKSPACE, workspace_name: "Workspace A", team_name: "Acme" });
		const upsert = find(requests, "POST", "/slack_user_links")[0];
		expect(upsert.body).toMatchObject({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: "user-a" });
		expect(upsert.url.searchParams.get("on_conflict")).toBe("installation_id,slack_user_id");
		expect(upsert.headers.get("prefer")).toContain("resolution=merge-duplicates");
		const membership = find(requests, "GET", "/workspace_members")[0];
		expect(membership.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(find(requests, "POST", "/workspace_audit_events")[0].body).toMatchObject({ action: "slack_agent.account_linked", target_id: "U0PERSON01" });
	});

	it("refuses people outside the workspace", async () => {
		const requests = database({ role: null, linkInstallation: live });
		const response = await link(await linkToken());
		expect(response.status).toBe(403);
		expect(find(requests, "POST", "/slack_user_links")).toHaveLength(0);
	});

	it("refuses expired, forged and wrong-purpose tokens, and uninstalled agents", async () => {
		database({ role: "member", linkInstallation: live });
		expect(await (await link(await linkToken({}, Date.now() - 16 * 60_000))).json()).toMatchObject({ error: "link_expired" });
		expect((await link(`${(await linkToken()).split(".")[0]}.AAAA`)).status).toBe(400);
		expect((await link(await signSlackToken(env as never, "install", { installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01" }, 600))).status).toBe(400);
		expect((await link(await linkToken({ slack_user_id: "not-a-user" }))).status).toBe(400);
		database({ role: "member", linkInstallation: { ...live, status: "uninstalled" } });
		expect((await link(await linkToken())).status).toBe(404);
		database({ role: "member", linkInstallation: live });
		expect((await link(await linkToken(), "")).status).toBe(401);
	});
});

describe("The Slack agent's key", () => {
	it("is hidden like the Chat key", async () => {
		database({ role: "admin", keyById: { id: KEY_ID, workspace_id: WORKSPACE, name: "__slack_agent_managed_key__", status: "active" } });
		const response = await call(`/keys/${KEY_ID}`);
		expect(response.status).toBe(404);
	});
});
