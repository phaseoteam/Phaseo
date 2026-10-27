import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunner, AgentTurnOutput, AgentTurnRequest } from "../src/agent";
import { clearUserFactsCache } from "../src/access";
import { deletePage, deletePages, listPages } from "../src/admin";
import { processEvent, type SlackEnvelope } from "../src/events";
import { createApp } from "../src/index";
import { hostedApp, type Installation } from "../src/installations";
import { base64UrlEncode, encryptSlackSecrets, signSlackToken } from "../src/lib/slack-secrets";
import { PAGE_CSP, SESSION_COOKIE, SIGN_IN_COOKIE } from "../src/page-viewer";
import {
	MAX_LIVE_PAGES,
	MAX_PAGE_BYTES,
	MAX_PAGES_PER_ANSWER,
	PUBLISH_PAGE_TOOL_ID,
	publishPageTool,
	turnPageTools,
	type PageStore,
	type PublishInput,
} from "../src/pages";
import type { TurnRef } from "../src/turns";
import { runTurn, type StepConfig, type StepRunner } from "../src/workflow";
import {
	BOT_USER_ID, COMPANY_APP_ID, COMPANY_APP_ROW_ID, eventEnvelope, INSTALLATION_ID, installationRow, storageOf, TEAM_ID, TEST_ENCRYPTION_KEY, testWorld,
	type TestWorld,
} from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const DAY = 24 * 60 * 60_000;
const ORIGIN = "https://slack.phaseo.app";
const CLIENT_ID = "1111111111.2222222222";
const CLIENT_SECRET = "test-hosted-client-secret";
const HTML = "<!doctype html><title>Spend</title><h1>October spend</h1><script>document.title += '!'</script>";
const URL_PATTERN = /^https:\/\/slack\.phaseo\.app\/p\/([0-9a-f]{64})\/([A-Za-z0-9_-]{22})$/;

let world: TestWorld;

function newWorld(overrides: Partial<TestWorld["env"]> = {}) {
	world = testWorld({ now: NOW, envOverrides: { PUBLIC_ORIGIN: ORIGIN, ...overrides } });
}

async function install(overrides: Partial<Installation> = {}) {
	world.db.tables.slack_installations = [await installationRow(overrides)];
}

function store(installationId = INSTALLATION_ID): PageStore {
	return world.pages.get(world.pages.idFromName(installationId));
}

function storeKey(installationId = INSTALLATION_ID): string {
	return world.pages.idFromName(installationId).toString();
}

function draft(overrides: Partial<PublishInput> = {}): PublishInput {
	return { installationId: INSTALLATION_ID, eventId: "Ev0PAGE0001", title: "October spend", html: HTML, access: "link", createdBy: "U0PERSON01", expiresAt: NOW + 30 * DAY, now: NOW, ...overrides };
}

async function published(overrides: Partial<PublishInput> = {}): Promise<string> {
	const result = await store(overrides.installationId).publish(draft(overrides));
	if (result.status !== "published") throw new Error(`not published: ${result.status}`);
	return result.id;
}

function request(path: string, init: RequestInit & { cookie?: string; fetchImpl?: typeof fetch } = {}) {
	const { cookie, fetchImpl, ...rest } = init;
	const deps = Object.assign({}, world.deps, fetchImpl ? { fetchImpl } : {});
	return createApp(() => deps).request(`${ORIGIN}${path}`, { ...rest, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(rest.headers as Record<string, string> | undefined) } }, world.env, {
		waitUntil: () => undefined, passThroughOnException: () => undefined, props: {},
	} as unknown as ExecutionContext);
}

beforeEach(async () => {
	newWorld();
	clearUserFactsCache();
	await install();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("PageStore", () => {
	it("keeps pages under random ids, at most 3 per answer, and lists them without their HTML", async () => {
		const ids = [await published(), await published({ now: NOW + 1 }), await published({ now: NOW + 2 })];
		expect(new Set(ids).size).toBe(3);
		for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
		// The answer's fourth page, even from a retried run of it.
		await expect(store().publish(draft({ now: NOW + 3 }))).resolves.toEqual({ status: "answer_limit" });
		await expect(store().publish(draft({ eventId: "Ev0PAGE0002", now: NOW + 3 }))).resolves.toMatchObject({ status: "published", answerPages: 1 });

		const listed = await store().list(NOW + 4);
		expect(listed).toHaveLength(4);
		expect(listed[3]).toEqual({ id: ids[0], title: "October spend", access: "link", createdBy: "U0PERSON01", createdAt: NOW, expiresAt: NOW + 30 * DAY, views: 0 });
		expect(JSON.stringify(listed)).not.toContain("<h1>");
		// It wakes daily to check the installation, or at the first expiry if sooner.
		expect(storageOf(store()).alarm).toBe(NOW + 3 + DAY);
	});

	it("refuses pages over the size cap, and more than 200 live pages per installation", async () => {
		await expect(store().publish(draft({ html: "x".repeat(MAX_PAGE_BYTES + 1) }))).resolves.toEqual({ status: "too_large" });
		for (let n = 0; n < MAX_LIVE_PAGES; n += 1) await published({ eventId: `Ev0FILL${String(n).padStart(4, "0")}` });
		await expect(store().publish(draft({ eventId: "Ev0ONEMORE" }))).resolves.toEqual({ status: "full" });
		// Expired pages don't count.
		await expect(store().publish(draft({ eventId: "Ev0ONEMORE", now: NOW + 31 * DAY, expiresAt: NOW + 61 * DAY }))).resolves.toMatchObject({ status: "published" });
		expect(await store().list(NOW + 31 * DAY)).toHaveLength(1);
	});

	it("deletes a page when it expires, and on the alarm", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const soon = await published({ expiresAt: NOW + 7 * DAY });
		const later = await published({ eventId: "Ev0PAGE0002" });
		expect(await store().page(soon, NOW + 7 * DAY)).toBeNull();
		expect(await store().page(later, NOW + 7 * DAY)).toMatchObject({ id: later, installationId: INSTALLATION_ID, html: HTML });
		vi.setSystemTime(NOW + 8 * DAY);
		await store().alarm();
		expect((await store().list(NOW + 8 * DAY)).map((page) => page.id)).toEqual([later]);
		expect(storageOf(store()).alarm).toBe(NOW + 9 * DAY);
		vi.setSystemTime(NOW + 30 * DAY);
		await store().alarm();
		expect(storageOf(store()).count("pages")).toBe(0);
		expect(storageOf(store()).alarm).toBeNull();
	});

	it("deletes everything once its installation is uninstalled, and keeps the pages while it can't check", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW + DAY);
		await published();
		const select = world.db.select.bind(world.db);
		world.db.select = async () => { throw new Error("database unavailable"); };
		await store().alarm();
		expect(storageOf(store()).count("pages")).toBe(1);
		expect(storageOf(store()).alarm).toBe(NOW + DAY + 60 * 60_000);
		world.db.select = select;
		world.db.tables.slack_installations[0].status = "uninstalled";
		await store().alarm();
		expect(storageOf(store()).count("pages")).toBe(0);
		expect(storageOf(store()).alarm).toBeNull();
	});
});

type Execute = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
const execute = (tool: { execute?: unknown }, input: Record<string, unknown>) => (tool.execute as Execute)(input);

describe("publish_page", () => {
	it("checks the title, the HTML and who can view it before publishing", async () => {
		const publish = vi.fn(async () => ({ status: "published" as const, id: "AAAAAAAAAAAAAAAAAAAAAA", expiresAt: NOW + 7 * DAY, answerPages: 1 }));
		const notes: string[] = [];
		const tool = publishPageTool({ modes: ["link"], defaultAccess: "link", expiryDays: 7, now: () => NOW, publish, url: (id) => `${ORIGIN}/p/key/${id}`, notes });
		expect(tool.id).toBe(PUBLISH_PAGE_TOOL_ID);
		// One way to share: the model doesn't choose.
		expect(Object.keys((tool.parameters as { properties: object }).properties)).toEqual(["title", "html"]);
		expect(tool.description).toContain("kept for 7 days");
		expect(tool.description).toContain("Who can view it: anyone with the link.");
		await expect(execute(tool, { title: " ", html: HTML })).rejects.toThrow("title must not be empty");
		await expect(execute(tool, { title: "x".repeat(121), html: HTML })).rejects.toThrow("at most 120 characters");
		await expect(execute(tool, { title: "Spend", html: "" })).rejects.toThrow("html must not be empty");
		await expect(execute(tool, { title: "Spend", html: "é".repeat(MAX_PAGE_BYTES / 2 + 1) })).rejects.toThrow("a page may be at most 512 KB");
		await expect(execute(tool, { title: "Spend", html: HTML, access: "workspace" })).rejects.toThrow("access must be one of: link");
		expect(publish).not.toHaveBeenCalled();

		await expect(execute(tool, { title: "  October\n spend ", html: HTML })).resolves.toEqual({
			url: `${ORIGIN}/p/key/AAAAAAAAAAAAAAAAAAAAAA`,
			title: "October spend",
			who_can_view: "anyone with the link",
			expires_on: "2026-10-28",
			pages_left_in_answer: MAX_PAGES_PER_ANSWER - 1,
		});
		expect(publish).toHaveBeenCalledWith({ title: "October spend", html: HTML, access: "link", expiresAt: NOW + 7 * DAY });
		// Working memory gets the tool's name only.
		expect(notes).toEqual(["publish_page"]);
	});

	it("explains the limits to the model", async () => {
		const tool = (status: "answer_limit" | "full") => publishPageTool({ modes: ["link"], defaultAccess: "link", expiryDays: 30, now: () => NOW, publish: async () => ({ status }), url: (id) => id, notes: [] });
		await expect(execute(tool("answer_limit"), { title: "Spend", html: HTML })).rejects.toThrow("published 3 pages in this answer");
		await expect(execute(tool("full"), { title: "Spend", html: HTML })).rejects.toThrow("already keeps 200 pages");
	});

	describe("offered to a turn", () => {
		const turn = { eventId: "Ev0TURN0001", slackUserId: "U0PERSON01" };
		const offered = async (overrides: Partial<Installation> = {}, external = false) =>
			turnPageTools(world.deps, { ...turn, external }, await installationRow(overrides), []);
		const access = (tools: Awaited<ReturnType<typeof offered>>) => (tools[0].parameters as { properties: { access?: { enum: string[] } } }).properties.access?.enum ?? null;

		it("with links only, until Sign in with Slack is set up for the app", async () => {
			const tools = await offered();
			expect(tools.map((tool) => tool.id)).toEqual(["publish_page"]);
			expect(access(tools)).toBeNull();
			// Without link sharing there is no way to share.
			expect(await offered({ page_link_access: false, page_default_access: "workspace" })).toEqual([]);
		});

		it("with both ways once the hosted app's client credentials are set, defaulting to the admins' choice", async () => {
			newWorld({ SLACK_CLIENT_ID: CLIENT_ID, SLACK_CLIENT_SECRET: CLIENT_SECRET });
			expect(access(await offered())).toEqual(["link", "workspace"]);
			expect((await offered({ page_default_access: "workspace" }))[0].description).toContain('people in this Slack workspace, after they sign in with Slack ("workspace", the default)');
			const workspaceOnly = await offered({ page_link_access: false, page_default_access: "workspace" });
			expect(access(workspaceOnly)).toBeNull();
			expect(workspaceOnly[0].description).toContain("Who can view it: people in this Slack workspace");
		});

		it("with Sign in with Slack through a company's own app", async () => {
			world.db.tables.slack_apps.push({
				id: COMPANY_APP_ROW_ID, slack_app_id: COMPANY_APP_ID, client_id: CLIENT_ID,
				secrets_ciphertext: await encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { signing_secret: "test-company-signing", client_secret: CLIENT_SECRET }),
			});
			expect(access(await offered({ slack_app_id: COMPANY_APP_ROW_ID }))).toEqual(["link", "workspace"]);
		});

		it("never: with pages off, to someone from another organisation, or without a public https origin", async () => {
			expect(await offered({ pages_enabled: false })).toEqual([]);
			expect(await offered({}, true)).toEqual([]);
			newWorld({ PUBLIC_ORIGIN: undefined });
			expect(await offered()).toEqual([]);
			newWorld({ PUBLIC_ORIGIN: "http://slack.phaseo.app", ENV: "production" });
			expect(await offered()).toEqual([]);
		});

		it("publishes to the installation's store, with the answer's event and the person, and links it", async () => {
			const [tool] = await offered({ page_expiry_days: 90 });
			const result = await execute(tool, { title: "October spend", html: HTML });
			const [, key, id] = String(result.url).match(URL_PATTERN) ?? [];
			expect(key).toBe(storeKey());
			expect(result.expires_on).toBe("2027-01-19");
			expect(await store().page(id, NOW)).toMatchObject({ title: "October spend", access: "link", createdBy: "U0PERSON01", expiresAt: NOW + 90 * DAY, html: HTML });
		});
	});
});

describe("serving a page", () => {
	it("serves a link page under the sandbox, with no caching or referrer, and counts the view", async () => {
		const id = await published();
		const response = await request(`/p/${storeKey()}/${id}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(HTML);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
			"x-content-type-options": "nosniff",
			"referrer-policy": "no-referrer",
			"cache-control": "private, no-store",
			"x-frame-options": "DENY",
			"x-robots-tag": "noindex, nofollow, noarchive",
		});
		expect(PAGE_CSP).not.toContain("allow-same-origin");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect((await store().list(NOW))[0].views).toBe(1);
	});

	it("is not found: unknown, malformed, expired or deleted pages, and stores this namespace never made", async () => {
		const id = await published();
		const missing = [
			`/p/${storeKey()}/${"A".repeat(22)}`,
			`/p/${"0".repeat(64)}/${id}`,
			`/p/${storeKey()}/${id.slice(1)}`,
			`/p/${storeKey().toUpperCase()}/${id}`,
		];
		for (const path of missing) {
			const response = await request(path);
			expect(response.status, path).toBe(404);
			expect(response.headers.get("content-security-policy")).not.toContain("script-src");
			expect(await response.text()).toContain("doesn&#39;t exist, has expired or was deleted");
		}
		world.clock.now = NOW + 30 * DAY;
		expect((await request(`/p/${storeKey()}/${id}`)).status).toBe(404);
		expect(storageOf(store()).count("pages")).toBe(0);
	});

	it("shows link unfurlers a generic page whether or not it exists, and counts no view", async () => {
		const id = await published();
		for (const path of [`/p/${storeKey()}/${id}`, `/p/${storeKey()}/${"B".repeat(22)}`]) {
			const response = await request(path, { headers: { "User-Agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" } });
			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).toContain("A page shared by the Phaseo agent");
			expect(body).not.toContain("October");
		}
		expect((await store().list(NOW))[0].views).toBe(0);
	});

	it("deletes the store's pages once the installation is uninstalled", async () => {
		const id = await published();
		world.db.tables.slack_installations[0].status = "uninstalled";
		expect((await request(`/p/${storeKey()}/${id}`)).status).toBe(404);
		expect(storageOf(store()).count("pages")).toBe(0);
	});

	it("serves nothing without a public origin", async () => {
		const id = await published();
		world.env.PUBLIC_ORIGIN = undefined;
		expect((await request(`/p/${storeKey()}/${id}`)).status).toBe(404);
	});
});

/** An ID token as Slack's token endpoint returns it. Its signature isn't checked, so any will do. */
function idToken(claims: Record<string, unknown>): string {
	const part = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
	return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
}

describe("Sign in with Slack for workspace pages", () => {
	beforeEach(async () => {
		newWorld({ SLACK_CLIENT_ID: CLIENT_ID, SLACK_CLIENT_SECRET: CLIENT_SECRET });
		await install();
	});

	/** Opens a workspace page without a session: the redirect to Slack, its state and nonce, and the sign-in cookie. */
	async function startSignIn(id: string) {
		const response = await request(`/p/${storeKey()}/${id}`);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location")!);
		const cookie = response.headers.get("set-cookie")!.split(";")[0];
		return { response, location, cookie, state: location.searchParams.get("state")!, nonce: location.searchParams.get("nonce")! };
	}

	const goodClaims = (nonce: string, overrides: Record<string, unknown> = {}) => ({
		iss: "https://slack.com", aud: CLIENT_ID, exp: Math.floor(NOW / 1000) + 3600, nonce,
		sub: "U0VIEWER01", "https://slack.com/user_id": "U0VIEWER01", "https://slack.com/team_id": TEAM_ID, ...overrides,
	});

	/** Slack's token endpoint, answering with an ID token for the claims (or refusing, for null). */
	function tokenEndpoint(claims: Record<string, unknown> | null, calls: Array<Record<string, string>> = []): typeof fetch {
		return (async (_url: string, init: RequestInit) => {
			calls.push(Object.fromEntries(new URLSearchParams(String(init.body))));
			return new Response(JSON.stringify(claims ? { ok: true, access_token: "xoxp-test", token_type: "Bearer", id_token: idToken(claims) } : { ok: false, error: "invalid_code" }));
		}) as unknown as typeof fetch;
	}

	async function signIn(id: string, claims: (nonce: string) => Record<string, unknown> | null = (nonce) => goodClaims(nonce)) {
		const started = await startSignIn(id);
		const calls: Array<Record<string, string>> = [];
		const response = await request(`/p/signin?code=test-code&state=${encodeURIComponent(started.state)}`, { cookie: started.cookie, fetchImpl: tokenEndpoint(claims(started.nonce), calls) });
		return { started, response, calls };
	}

	it("sends a viewer without a session to Slack, bound to their browser, without the page's id", async () => {
		const id = await published({ access: "workspace" });
		const { response, location } = await startSignIn(id);
		expect(`${location.origin}${location.pathname}`).toBe("https://slack.com/openid/connect/authorize");
		expect(Object.fromEntries(location.searchParams)).toMatchObject({ response_type: "code", scope: "openid", client_id: CLIENT_ID, redirect_uri: `${ORIGIN}/p/signin`, team: TEAM_ID });
		expect(location.toString()).not.toContain(id);
		expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${SIGN_IN_COOKIE}=[A-Za-z0-9_-]{22}~${storeKey()}~${id}; Path=/p/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$`));
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		expect((await store().list(NOW))[0].views).toBe(0);
	});

	it("signs a member in, then serves the page on their session", async () => {
		const id = await published({ access: "workspace" });
		const { response, calls } = await signIn(id);
		expect(calls).toEqual([{ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: "test-code", redirect_uri: `${ORIGIN}/p/signin` }]);
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(`${ORIGIN}/p/${storeKey()}/${id}`);
		const [session, cleared] = response.headers.getSetCookie();
		expect(cleared).toBe(`${SIGN_IN_COOKIE}=; Path=/p/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
		expect(session).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_.-]+; Path=/p/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax$`));
		// users.info with the installation's bot token decided membership.
		expect(world.slack.of("users.info").map((call) => call.args.user)).toEqual(["U0VIEWER01"]);

		const cookie = session.split(";")[0];
		const page = await request(`/p/${storeKey()}/${id}`, { cookie });
		expect(page.status).toBe(200);
		expect(await page.text()).toBe(HTML);
		expect((await store().list(NOW))[0].views).toBe(1);
		// A session is for one installation, and can't be altered.
		const other = await signSlackToken(world.env, "page_session", { installation_id: "00000000-0000-4000-8000-0000000000ff", slack_user_id: "U0VIEWER01" }, 3600, NOW);
		expect((await request(`/p/${storeKey()}/${id}`, { cookie: `${SESSION_COOKIE}=${other}` })).status).toBe(302);
		expect((await request(`/p/${storeKey()}/${id}`, { cookie: `${cookie}x` })).status).toBe(302);
		// Nor does a sign-in token stand in for one.
		const signInToken = await signSlackToken(world.env, "page_signin", { installation_id: INSTALLATION_ID, slack_user_id: "U0VIEWER01" }, 3600, NOW);
		expect((await request(`/p/${storeKey()}/${id}`, { cookie: `${SESSION_COOKIE}=${signInToken}` })).status).toBe(302);
	});

	it("asks for a sign-in on link pages once admins turn link sharing off", async () => {
		const id = await published({ access: "link" });
		world.db.tables.slack_installations[0].page_link_access = false;
		world.db.tables.slack_installations[0].page_default_access = "workspace";
		expect((await request(`/p/${storeKey()}/${id}`)).status).toBe(302);
	});

	it("can't sign in where the app's client credentials aren't set", async () => {
		const id = await published({ access: "workspace" });
		world.env.SLACK_CLIENT_SECRET = undefined;
		const response = await request(`/p/${storeKey()}/${id}`);
		expect(response.status).toBe(403);
		expect(await response.text()).toContain("signing in with Slack isn&#39;t set up");
	});

	it("refuses a sign-in from another browser, a forged state, or one Slack didn't confirm", async () => {
		const id = await published({ access: "workspace" });
		const started = await startSignIn(id);
		const fetchImpl = tokenEndpoint(goodClaims(started.nonce));
		// No cookie, another browser's, or a state that isn't ours.
		expect((await request(`/p/signin?code=c&state=${encodeURIComponent(started.state)}`, { fetchImpl })).status).toBe(400);
		const other = await startSignIn(id);
		expect((await request(`/p/signin?code=c&state=${encodeURIComponent(started.state)}`, { cookie: other.cookie, fetchImpl })).status).toBe(400);
		expect((await request(`/p/signin?code=c&state=${encodeURIComponent(`${started.state}x`)}`, { cookie: started.cookie, fetchImpl })).status).toBe(400);
		// Cancelled at Slack.
		const cancelled = await request("/p/signin?error=access_denied&state=x", { cookie: started.cookie });
		expect(cancelled.status).toBe(403);
		expect(await cancelled.text()).toContain("was cancelled");

		for (const claims of [
			() => null,
			(nonce: string) => goodClaims(`${nonce}x`),
			(nonce: string) => goodClaims(nonce, { aud: "999.999" }),
			(nonce: string) => goodClaims(nonce, { iss: "https://example.com" }),
			(nonce: string) => goodClaims(nonce, { exp: Math.floor(NOW / 1000) - 1 }),
		]) {
			const { response } = await signIn(id, claims);
			expect(response.status).toBe(502);
			expect(response.headers.get("set-cookie")).not.toContain(SESSION_COOKIE);
		}
	});

	it("lets in only the workspace's members: not someone from another organisation, nor a guest unless guests may use the agent", async () => {
		const id = await published({ access: "workspace" });
		world.slack.users.set("U0VIEWER01", { id: "U0VIEWER01", team_id: "T0OTHER001" });
		expect((await signIn(id)).response.status).toBe(403);
		world.slack.users.set("U0VIEWER01", { id: "U0VIEWER01", team_id: TEAM_ID, is_restricted: true });
		world.db.tables.slack_installations[0].allow_guests = false;
		const guest = (await signIn(id)).response;
		expect(guest.status).toBe(403);
		expect(await guest.text()).toContain("not with its guests");
		world.db.tables.slack_installations[0].allow_guests = true;
		expect((await signIn(id)).response.status).toBe(303);
	});
});

describe("Settings → Slack (SlackAgentAdmin)", () => {
	it("lists an installation's pages with their links, and deletes one or all", async () => {
		const first = await published();
		const second = await published({ eventId: "Ev0PAGE0002", access: "workspace", now: NOW + 1000 });
		await store().recordView(first);
		const listed = await listPages(world.env, world.db, INSTALLATION_ID, NOW + 2000);
		expect(listed).toEqual({
			available: true,
			sign_in: false,
			limit: MAX_LIVE_PAGES,
			pages: [
				{ id: second, url: `${ORIGIN}/p/${storeKey()}/${second}`, title: "October spend", access: "workspace", created_by: "U0PERSON01", created_at: "2026-10-21T12:00:01.000Z", expires_at: "2026-11-20T12:00:00.000Z", views: 0 },
				{ id: first, url: `${ORIGIN}/p/${storeKey()}/${first}`, title: "October spend", access: "link", created_by: "U0PERSON01", created_at: "2026-10-21T12:00:00.000Z", expires_at: "2026-11-20T12:00:00.000Z", views: 1 },
			],
		});
		expect(JSON.stringify(listed)).not.toContain("<h1>");
		world.env.SLACK_CLIENT_ID = CLIENT_ID;
		world.env.SLACK_CLIENT_SECRET = CLIENT_SECRET;
		expect((await listPages(world.env, world.db, INSTALLATION_ID, NOW)).sign_in).toBe(true);
		expect(await listPages(world.env, world.db, "not-an-id", NOW)).toEqual({ available: true, sign_in: false, pages: [], limit: MAX_LIVE_PAGES });

		expect(await deletePage(world.env, INSTALLATION_ID, first)).toBe(true);
		expect(await deletePage(world.env, INSTALLATION_ID, first)).toBe(false);
		expect(await deletePage(world.env, INSTALLATION_ID, "../../etc")).toBe(false);
		await deletePages(world.env, INSTALLATION_ID);
		expect(storageOf(store()).count("pages")).toBe(0);
	});

	it("deletes the pages when the app is removed in Slack", async () => {
		await published();
		const outcome = await processEvent(world.deps, hostedApp(world.env)!, eventEnvelope({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED1" }) as SlackEnvelope);
		expect(outcome).toBe("uninstalled");
		expect(storageOf(store()).count("pages")).toBe(0);
	});
});

describe("in an answer", () => {
	/** Runs each step once and keeps its output as JSON, as Workflows stores it. */
	class Step implements StepRunner {
		outputs: unknown[] = [];
		async do<T>(_name: string, _config: StepConfig, callback: (context: { attempt: number }) => Promise<T>): Promise<T> {
			const output = JSON.parse(JSON.stringify((await callback({ attempt: 1 })) ?? null)) as T;
			this.outputs.push(output);
			return output;
		}
		async waitForEvent(): Promise<unknown> {
			throw new Error("no questions here");
		}
	}

	async function answerWith(script: (request: AgentTurnRequest) => Promise<string>, external = false) {
		const threadKey = `${INSTALLATION_ID}:C0CHANNEL1:1792600000.000100`;
		const coordinator = world.threads.get(world.threads.idFromName(threadKey));
		let started: TurnRef | null = null;
		coordinator.runner = { start: async (turn) => { started = turn; return { started: true }; } };
		await coordinator.enqueue({
			threadKey, eventId: "Ev0ANSWER01", installationId: INSTALLATION_ID, teamId: TEAM_ID, channel: "C0CHANNEL1", threadTs: "1792600000.000100", messageTs: "1792600000.000100",
			slackUserId: "U0PERSON01", kind: "mention", text: `<@${BOT_USER_ID}> make me a page of our spend`, ...(external ? { external: true } : {}),
		}, NOW);
		const requests: AgentTurnRequest[] = [];
		const agent: AgentRunner = {
			run: async (request, hooks) => {
				requests.push(request);
				await hooks.onText(await script(request));
				await hooks.onStep({ costUsd: 0.01 });
				return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null } satisfies AgentTurnOutput;
			},
			ask: async () => { throw new Error("unexpected ask"); },
		};
		const step = new Step();
		await runTurn({ ...world.deps, agent }, started!, step);
		return { requests, step, coordinator };
	}

	it("links a published page in the reply, and keeps its id, title and HTML out of step outputs", async () => {
		let url = "";
		const { requests, step, coordinator } = await answerWith(async (request) => {
			const tool = request.tools.find((entry) => entry.id === "publish_page")!;
			url = String((await execute(tool, { title: "Our October spend", html: HTML })).url);
			return `Here it is: [Our October spend](${url})`;
		});
		expect(requests[0].tools.map((tool) => tool.id)).toContain("publish_page");
		const [, , id] = url.match(URL_PATTERN) ?? [];
		expect(await store().page(id, NOW)).toMatchObject({ createdBy: "U0PERSON01", title: "Our October spend" });
		const stored = JSON.stringify(step.outputs);
		for (const text of [id, "Our October spend", "<h1>"]) expect(stored).not.toContain(text);
		expect(world.slack.of("chat.startStream")[0].args.markdown_text).toContain(url);
		// The thread's working memory notes the tool, not the page.
		expect(coordinator.workingMemory().filter((entry) => entry.kind === "tool").map((entry) => entry.text)).toEqual(["publish_page"]);
	});

	it("isn't offered to someone from another organisation", async () => {
		const { requests } = await answerWith(async () => "No page.", true);
		expect(requests[0].tools.map((tool) => tool.id)).not.toContain("publish_page");
	});
});
