import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySlackToken as webApiVerifySlackToken } from "../../web-api/src/lib/slack-secrets";
import { clearUserFactsCache, refusalText } from "../src/access";
import { meterSettings, processEvent, type SlackEnvelope } from "../src/events";
import { hostedApp, installationSecrets, type Installation } from "../src/installations";
import type { TurnRunner } from "../src/turns";
import {
	BOT_TOKEN,
	BOT_USER_ID,
	directMessage,
	eventEnvelope,
	INSTALLATION_ID,
	installationRow,
	mention,
	TEAM_ID,
	TEST_STATE_SECRET,
	testWorld,
	WORKSPACE_ID,
	type TestWorld,
} from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

let world: TestWorld;
let counter = 0;

async function install(overrides: Partial<Installation> = {}, secrets: Record<string, string> = {}) {
	world.db.tables.slack_installations = [await installationRow(overrides, secrets)];
}

function run(event: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
	const envelope = eventEnvelope(event, { event_id: `Ev0RUN${String((counter += 1)).padStart(4, "0")}`, ...overrides }) as SlackEnvelope;
	return processEvent(world.deps, hostedApp(world.env)!, envelope);
}

/** The admin emails asked for so far. */
function refusalEmails() {
	return world.db.rpcs.filter((call) => call.fn === "queue_slack_agent_refusal_email").map((call) => call.args);
}

beforeEach(async () => {
	world = testWorld({ now: NOW });
	clearUserFactsCache();
	await install();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("events: who is ignored", () => {
	it("ignores bots and apps, including this one, and edits", async () => {
		await expect(run(mention({ bot_id: "B0OTHER001" }))).resolves.toBe("ignored_bot");
		await expect(run(directMessage({ subtype: "bot_message", bot_id: "B0OTHER001" }))).resolves.toBe("ignored_bot");
		await expect(run(directMessage({ app_id: "A0OTHER001" }))).resolves.toBe("ignored_bot");
		await expect(run(directMessage({ subtype: "message_changed" }))).resolves.toBe("ignored_bot");
		await expect(run(directMessage({ subtype: "message_deleted" }))).resolves.toBe("ignored_bot");
		await expect(run(directMessage({ user: BOT_USER_ID }))).resolves.toBe("ignored_self");
		// A bot user Slack only reveals through users.info.
		world.slack.users.set("U0BOTUSER1", { id: "U0BOTUSER1", team_id: TEAM_ID, is_bot: true });
		await expect(run(directMessage({ user: "U0BOTUSER1" }))).resolves.toBe("ignored_bot");
		expect(world.slack.ephemerals()).toHaveLength(0);
	});

	it("answers a person's file share, but not channel messages it wasn't mentioned in", async () => {
		await expect(run(directMessage({ subtype: "file_share" }))).resolves.toBe("started");
		await expect(run({ ...directMessage(), channel_type: "channel", channel: "C0CHANNEL1" })).resolves.toBe("ignored");
		await expect(run({ type: "reaction_added", user: "U0PERSON01" })).resolves.toBe("ignored");
	});

	it("ignores events for an installation that isn't live", async () => {
		world.db.tables.slack_installations = [];
		await expect(run(mention())).resolves.toBe("no_installation");
	});
});

describe("events: who gets an answer", () => {
	it("queues a turn in the thread's coordinator, with the message kept only there", async () => {
		const runner: TurnRunner = { start: async () => ({ started: true }) };
		const key = `${INSTALLATION_ID}:C0CHANNEL1:1792600000.000050`;
		const thread = world.threads.get(world.threads.idFromName(key));
		thread.runner = runner;
		await expect(run(mention({ thread_ts: "1792600000.000050" }))).resolves.toBe("started");
		await expect(run(mention({ thread_ts: "1792600000.000050", ts: "1792600000.000300" }))).resolves.toBe("queued");
		expect(thread.turnInput(1)).toMatchObject({ text: "<@U0BOT00001> what did we spend this week?" });
		expect(world.meters.get(world.meters.idFromName(INSTALLATION_ID)).usage(NOW)).toMatchObject({ people: 1, pending: 2 });
	});

	it("tells people when the agent is paused or a payment is due", async () => {
		await install({ status: "paused" });
		await expect(run(mention())).resolves.toBe("refused_paused");
		await install({ status: "payment_due" });
		await expect(run(mention())).resolves.toBe("refused_payment_due");
		const replies = world.slack.ephemerals();
		expect(replies.map((call) => call.args.text)).toEqual([
			"The Phaseo agent is paused in this Slack workspace. An admin can turn it back on in Phaseo settings.",
			"The Phaseo agent is paused until this workspace's Phaseo bill is paid. An admin can add credits in Phaseo billing.",
		]);
		expect(replies[0]).toMatchObject({ token: BOT_TOKEN, args: { channel: "C0CHANNEL1", user: "U0PERSON01" } });
		// A top-level mention has no thread yet, so the reply isn't put in one.
		expect(replies[0].args.thread_ts).toBeUndefined();
		// Only the unpaid charge is emailed to admins; a pause is their own choice.
		expect(refusalEmails()).toEqual([{ p_installation_id: INSTALLATION_ID, p_reason: "payment_due", p_people: null }]);
	});

	it("still refuses when the admin email can't be queued", async () => {
		world.db.failingRpcs.add("queue_slack_agent_refusal_email");
		await install({ status: "payment_due" });
		await expect(run(mention())).resolves.toBe("refused_payment_due");
		expect(world.slack.ephemerals()).toHaveLength(1);
	});

	it("refuses people from other organisations by default, and records one admin notice", async () => {
		world.slack.users.set("U0OUTSIDE1", { id: "U0OUTSIDE1", team_id: "T0OTHER001", is_stranger: true });
		await expect(run(mention({ user: "U0OUTSIDE1", thread_ts: "1792600000.000050" }))).resolves.toBe("refused_external_user");
		await expect(run(mention({ user: "U0OUTSIDE1", thread_ts: "1792600000.000050" }))).resolves.toBe("refused_external_user");
		const reply = world.slack.ephemerals()[0];
		expect(reply.args).toMatchObject({ user: "U0OUTSIDE1", thread_ts: "1792600000.000050" });
		expect(world.db.tables.workspace_audit_events).toEqual([{
			workspace_id: WORKSPACE_ID,
			actor_user_id: null,
			action: "slack_agent.answer_refused",
			target_type: "slack_installation",
			target_id: INSTALLATION_ID,
			target_name: null,
			metadata: { reason: "external_user", slack_user_id: "U0OUTSIDE1", people: 0, plan_people: 3, tier_people: 3, max_people: null, answers_per_person_hour: 60 },
		}]);
		await install({ allow_external_users: true });
		clearUserFactsCache();
		await expect(run(mention({ user: "U0OUTSIDE1" }))).resolves.toBe("started");
		expect(refusalEmails(), "an admin's own setting is not emailed").toEqual([]);
	});

	it("treats another workspace of the same Enterprise Grid org as inside the organisation", async () => {
		await install({ enterprise_id: "E0ORG00001" });
		world.slack.users.set("U0SISTER01", { id: "U0SISTER01", team_id: "T0SISTER01", enterprise_user: { enterprise_id: "E0ORG00001" } });
		await expect(run(mention({ user: "U0SISTER01" }))).resolves.toBe("started");
	});

	it("refuses guests only when an admin turned them off", async () => {
		world.slack.users.set("U0GUEST001", { id: "U0GUEST001", team_id: TEAM_ID, is_restricted: true });
		await expect(run(mention({ user: "U0GUEST001" }))).resolves.toBe("started");
		await install({ allow_guests: false });
		await expect(run(mention({ user: "U0GUEST001", ts: "1792600000.000500" }))).resolves.toBe("refused_guest");
	});

	it("asks again later when Slack can't say who someone is", async () => {
		world.slack.failUsersInfo = true;
		await expect(run(mention())).resolves.toBe("refused_user_unverified");
		expect(world.meters.get(world.meters.idFromName(INSTALLATION_ID)).usage(NOW).people).toBe(0);
	});

	it("says which plan is full, in dollars", async () => {
		await install({ plan_people: 3 });
		for (const [index, user] of ["U0PERSON01", "U0PERSON02", "U0PERSON03"].entries()) await expect(run(directMessage({ user, ts: `1792600010.00000${index}` }))).resolves.toBe("started");
		await expect(run(directMessage({ user: "U0PERSON04", ts: "1792600010.000009" }))).resolves.toBe("refused_plan_full");
		expect(world.slack.ephemerals().at(-1)?.args.text).toBe(
			"The Phaseo agent has answered as many people this month as this workspace's plan covers (3 people, $0.99 a month). An admin can move to a bigger plan in Phaseo settings.",
		);
		expect(world.db.tables.workspace_audit_events).toHaveLength(1);
		expect(refusalEmails()).toEqual([{ p_installation_id: INSTALLATION_ID, p_reason: "plan_full", p_people: 3 }]);
		// The audit log hears once a month; the email is asked for again and the database dedupes it.
		await expect(run(directMessage({ user: "U0PERSON05", ts: "1792600010.000010" }))).resolves.toBe("refused_plan_full");
		expect(world.db.tables.workspace_audit_events).toHaveLength(1);
		expect(refusalEmails()).toHaveLength(2);
	});

	it("tries the admin email again on the next refusal when queueing it failed", async () => {
		await install({ plan_people: 3 });
		for (const [index, user] of ["U0PERSON01", "U0PERSON02", "U0PERSON03"].entries()) await expect(run(directMessage({ user, ts: `1792600010.00000${index}` }))).resolves.toBe("started");
		world.db.failingRpcs.add("queue_slack_agent_refusal_email");
		await expect(run(directMessage({ user: "U0PERSON04", ts: "1792600010.000009" }))).resolves.toBe("refused_plan_full");
		world.db.failingRpcs.delete("queue_slack_agent_refusal_email");
		// The meter has already used this month's audit notice, but the email is still asked for.
		await expect(run(directMessage({ user: "U0PERSON05", ts: "1792600010.000010" }))).resolves.toBe("refused_plan_full");
		expect(world.db.tables.workspace_audit_events).toHaveLength(1);
		expect(refusalEmails()).toHaveLength(2);
	});

	it("never says an admin has been told, since an email can be suppressed or fail", () => {
		const reasons = ["paused", "payment_due", "external_user", "guest", "plan_full", "max_people", "monthly_cap", "hourly_limit", "user_unverified", "busy"] as const;
		for (const reason of reasons) {
			const text = refusalText(reason, { tier: { people: 3, priceNanos: 990_000_000 }, limit: 60 });
			expect(text).toBeTruthy();
			expect(text).not.toMatch(/notif|been told|been asked/i);
		}
		expect(refusalText("max_people")).toBe("This workspace has reached its Slack agent limit for the month. An admin can change the limits in Phaseo settings.");
		expect(refusalText("uninstalled")).toBeNull();
	});

	it("gives a busy reply and the meter place back when a thread's queue is full", async () => {
		const key = `${INSTALLATION_ID}:D0DIRECT01:1792600000.000050`;
		world.threads.get(world.threads.idFromName(key)).runner = { start: async () => ({ started: true }) };
		for (let index = 0; index < 6; index += 1) {
			await run(directMessage({ thread_ts: "1792600000.000050", ts: `1792600001.00000${index}` }));
		}
		await expect(run(directMessage({ thread_ts: "1792600000.000050", ts: "1792600002.000000" }))).resolves.toBe("refused_busy");
		expect(world.meters.get(world.meters.idFromName(INSTALLATION_ID)).usage(NOW).pending).toBe(6);
	});
});

describe("events: linked accounts", () => {
	it("offers unlinked people a Connect button whose token web-api accepts", async () => {
		await install({ access_mode: "linked" });
		await expect(run(directMessage())).resolves.toBe("link_required");
		const reply = world.slack.ephemerals()[0];
		expect(reply.args.text).toBe("Connect your Phaseo account to use the Phaseo agent here. The button works for 15 minutes.");
		const button = (reply.args.blocks as Array<{ type: string; elements?: Array<{ url: string; action_id: string }> }>)[1].elements![0];
		expect(button.action_id).toBe("connect_account");
		const url = new URL(button.url);
		expect(`${url.origin}${url.pathname}`).toBe("https://phaseo.app/slack/link");
		const verified = await webApiVerifySlackToken({ SLACK_STATE_SECRET: TEST_STATE_SECRET }, "link", url.searchParams.get("token"), NOW + 60_000);
		expect(verified).toMatchObject({ ok: true, payload: { installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", purpose: "link", exp: NOW / 1000 + 900 } });
		await expect(webApiVerifySlackToken({ SLACK_STATE_SECRET: TEST_STATE_SECRET }, "link", url.searchParams.get("token"), NOW + 901_000)).resolves.toEqual({ ok: false, reason: "expired" });
		// Unlinked people hold no place in the meter.
		expect(world.meters.get(world.meters.idFromName(INSTALLATION_ID)).usage(NOW).people).toBe(0);
	});

	it("answers linked people", async () => {
		await install({ access_mode: "linked" });
		world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: "00000000-0000-4000-8000-0000000000d1" });
		await expect(run(directMessage())).resolves.toBe("started");
	});
});

describe("events: installations", () => {
	it("finds an org-wide Enterprise Grid install by its enterprise", async () => {
		await install({ team_id: null, enterprise_id: "E0ORG00001" });
		const authorizations = [{ enterprise_id: "E0ORG00001", team_id: null, user_id: BOT_USER_ID, is_bot: true, is_enterprise_install: true }];
		await expect(run(mention(), { team_id: "T0SISTER01", authorizations })).resolves.toBe("started");
		expect(world.db.queries.at(0)?.query).toMatchObject({ enterprise_id: "eq.E0ORG00001", team_id: "is.null", slack_app_id: "is.null" });
	});

	it("refreshes a rotating bot token once, even for events arriving together", async () => {
		const refreshed = "xoxe.xoxb-1-test-refreshed-token";
		await install({}, { bot_refresh_token: "xoxe-1-test-refresh-token", bot_token_expires_at: new Date(NOW + 60_000).toISOString() });
		world.env.SLACK_CLIENT_ID = "1111111111.2222222222";
		world.env.SLACK_CLIENT_SECRET = "test-client-secret";
		const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
			expect(String(init.body)).toBe("grant_type=refresh_token&refresh_token=xoxe-1-test-refresh-token");
			return Response.json({ ok: true, token_type: "bot", access_token: refreshed, refresh_token: "xoxe-1-test-next-refresh", expires_in: 43_200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const results = await Promise.all([run(mention()), run(mention({ ts: "1792600000.000900" }))]);
		expect(results).toEqual(["started", "started"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(new Set(world.slack.calls.map((call) => call.token))).toEqual(new Set([refreshed]));
		const stored = await installationSecrets(world.env, String(world.db.tables.slack_installations[0].secrets_ciphertext));
		expect(stored).toMatchObject({ bot_token: refreshed, bot_refresh_token: "xoxe-1-test-next-refresh", gateway_key: "phaseo_v1_sk_testkid00000_testsecret" });
		expect(Date.parse(stored.bot_token_expires_at!)).toBeGreaterThan(Date.now() + 43_000_000);
	});
});

describe("events: removed in Slack", () => {
	const meter = () => world.meters.get(world.meters.idFromName(INSTALLATION_ID));

	it("uninstalls when the app is removed in Slack, once however often Slack retries, and answers nobody after", async () => {
		world.db.tables.slack_installations[0].installed_at = new Date(NOW - 86_400_000).toISOString();
		await expect(run(directMessage())).resolves.toBe("started");
		// A turn admitted just before the removal holds a place in the meter.
		meter().admit({ settings: meterSettings(await installationRow()), slackUserId: "U0PERSON02", facts: { isBot: false, isExternal: false, isGuest: false }, eventId: "Ev0INFLIGHT1", now: NOW });

		const removal = { event_id: "Ev0REMOVED01", event_time: NOW / 1000 + 60, authorizations: [] };
		await expect(run({ type: "app_uninstalled" }, removal)).resolves.toBe("uninstalled");
		expect(world.db.rpcs.filter((call) => call.fn === "uninstall_slack_agent_from_slack")).toEqual([{
			fn: "uninstall_slack_agent_from_slack",
			args: { p_installation_id: INSTALLATION_ID, p_event: "app_uninstalled", p_event_time: new Date(NOW + 60_000).toISOString() },
		}]);
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "uninstalled" });
		expect(world.db.tables.workspace_audit_events).toEqual([expect.objectContaining({ action: "slack_agent.uninstalled_in_slack", target_id: INSTALLATION_ID })]);

		// Slack's retry, and the tokens_revoked that comes with it, change nothing more.
		await expect(run({ type: "app_uninstalled" }, removal)).resolves.toBe("no_installation");
		await expect(run({ type: "tokens_revoked", tokens: { oauth: [], bot: [BOT_USER_ID] } }, { event_id: "Ev0REVOKED01", authorizations: [] })).resolves.toBe("no_installation");
		expect(world.db.tables.workspace_audit_events).toHaveLength(1);

		// The meter is closed: answers in progress are dropped and nobody else is admitted.
		expect(meter().usage(NOW)).toMatchObject({ pending: 0 });
		const late = meter().admit({ settings: meterSettings(await installationRow()), slackUserId: "U0PERSON01", facts: { isBot: false, isExternal: false, isGuest: false }, eventId: "Ev0LATE00001", now: NOW + 120_000 });
		expect(late).toMatchObject({ allowed: false, reason: "uninstalled", auditForAdmins: false });
		await expect(run(directMessage({ ts: "1792600000.000900" }))).resolves.toBe("no_installation");
		expect(world.slack.ephemerals()).toHaveLength(0);
	});

	it("uninstalls on tokens_revoked only when this installation's bot token was revoked", async () => {
		await expect(run({ type: "tokens_revoked", tokens: { oauth: ["U0PERSON01"], bot: [] } }, { event_id: "Ev0REVOKED01" })).resolves.toBe("ignored");
		await expect(run({ type: "tokens_revoked", tokens: { oauth: [], bot: ["U0OTHERBOT"] } }, { event_id: "Ev0REVOKED02" })).resolves.toBe("ignored");
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "active" });
		await expect(run({ type: "tokens_revoked", tokens: { oauth: [], bot: [BOT_USER_ID] } }, { event_id: "Ev0REVOKED03" })).resolves.toBe("uninstalled");
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "uninstalled" });
	});

	it("ignores a removal sent before the current install (a late retry after a reinstall)", async () => {
		world.db.tables.slack_installations[0].installed_at = new Date(NOW).toISOString();
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01", event_time: NOW / 1000 - 300 })).resolves.toBe("ignored");
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "active" });
		expect(meter().usage(NOW).period).toBe("2026-10-01");
		await expect(run(directMessage())).resolves.toBe("started");
	});

	it("reports an error when the database can't take the uninstall, so Slack sends it again", async () => {
		world.db.failingRpcs.add("uninstall_slack_agent_from_slack");
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" })).resolves.toBe("error");
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "active" });
		world.db.failingRpcs.clear();
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" })).resolves.toBe("uninstalled");
	});
});

describe("events: internal alert when removed in Slack", () => {
	const WEBHOOK = "https://discord.test/api/webhooks/1/alerts";
	const alertFetch = (respond: () => Response | Promise<Response> = () => new Response(null, { status: 204 })) => {
		const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => respond());
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	};

	beforeEach(() => {
		world.env.DISCORD_SIGNUP_WEBHOOK_URL = WEBHOOK;
		world.db.tables.slack_installations[0].team_name = "Acme Slack";
		world.db.tables.workspaces.push({ id: WORKSPACE_ID, name: "Acme" });
	});

	it("tells the Phaseo team once, with names only", async () => {
		const fetchMock = alertFetch();
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01", authorizations: [] })).resolves.toBe("uninstalled");
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01", authorizations: [] })).resolves.toBe("no_installation");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(WEBHOOK);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			content: [
				"Slack agent uninstalled",
				`- workspace: \`Acme\` (\`${WORKSPACE_ID}\`)`,
				"- slack_team: `Acme Slack`",
				"- app: `hosted`",
				"- uninstalled_by: removed in Slack (`app_uninstalled`)",
			].join("\n"),
			allowed_mentions: { parse: [] },
		});
		expect(String(init.body)).not.toContain(BOT_TOKEN);
	});

	it("names a revoked token and a company app", async () => {
		await install({ slack_app_id: "00000000-0000-4000-8000-0000000000c1" });
		world.db.tables.slack_installations[0].team_name = "Acme Slack";
		const fetchMock = alertFetch();
		const app = { appRowId: "00000000-0000-4000-8000-0000000000c1", slackAppId: "A0COMPANY1", signingSecret: "s" };
		const envelope = eventEnvelope({ type: "tokens_revoked", tokens: { oauth: [], bot: [BOT_USER_ID] } }, { event_id: "Ev0REVOKED01" }) as SlackEnvelope;
		await expect(processEvent(world.deps, app, envelope)).resolves.toBe("uninstalled");
		const content = JSON.parse(String(fetchMock.mock.calls[0][1].body)).content as string;
		expect(content).toContain("- app: `company`");
		expect(content).toContain("- uninstalled_by: removed in Slack (`tokens_revoked`)");
	});

	it("still sends, with ids, when the names can't be read", async () => {
		const fetchMock = alertFetch();
		const select = world.db.select.bind(world.db);
		// Finding the installation works; reading the names for the alert doesn't.
		world.db.select = async <T,>(table: string, query: Record<string, string>) => {
			if (table === "workspaces" || query.select === "team_name") throw new Error("db_error_503");
			return select<T>(table, query);
		};
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" })).resolves.toBe("uninstalled");
		const content = JSON.parse(String(fetchMock.mock.calls[0][1].body)).content as string;
		expect(content).toContain(`- workspace: \`unknown\` (\`${WORKSPACE_ID}\`)`);
		expect(content).toContain("- slack_team: `unknown`");
	});

	it("never changes the outcome when the alert fails", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			alertFetch(() => new Response("nope", { status: 500 }));
			await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" })).resolves.toBe("uninstalled");
			expect(errors).toHaveBeenCalledWith("[slack-agent] uninstall alert failed", { installationId: INSTALLATION_ID, status: 500 });

			await install();
			alertFetch(() => { throw new TypeError("fetch failed"); });
			await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED02" })).resolves.toBe("uninstalled");
			expect(errors).toHaveBeenCalledWith("[slack-agent] uninstall alert failed", { installationId: INSTALLATION_ID, status: null });
		} finally {
			errors.mockRestore();
		}
	});

	it("runs after Slack is answered, so a slow webhook can't delay the acknowledgement", async () => {
		let release!: () => void;
		const fetchMock = alertFetch(() => new Promise<Response>((resolve) => { release = () => resolve(new Response(null, { status: 204 })); }));
		const later: Promise<unknown>[] = [];
		const envelope = eventEnvelope({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" }) as SlackEnvelope;
		await expect(processEvent({ ...world.deps, waitUntil: (work) => later.push(work) }, hostedApp(world.env)!, envelope)).resolves.toBe("uninstalled");
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "uninstalled" });
		expect(later).toHaveLength(1);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		release();
		await later[0];
	});

	it("is off without the webhook", async () => {
		world.env.DISCORD_SIGNUP_WEBHOOK_URL = undefined;
		const fetchMock = alertFetch();
		await expect(run({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" })).resolves.toBe("uninstalled");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("events: stopping", () => {
	it("cancels the thread when someone presses Slack's stop button", async () => {
		const key = `${INSTALLATION_ID}:D0DIRECT01:1792600000.000050`;
		const thread = world.threads.get(world.threads.idFromName(key));
		thread.runner = { start: async () => ({ started: true }) };
		await run(directMessage({ thread_ts: "1792600000.000050" }));
		const stop = { type: "agent_session_stopped", user: "U0PERSON01", channel: "D0DIRECT01", thread_ts: "1792600000.000050", streaming_message_ts: [], event_ts: "1792600003.000000" };
		await expect(run(stop, { event_id: "Ev0STOP0001" })).resolves.toBe("cancelled");
		await expect(run(stop, { event_id: "Ev0STOP0001" })).resolves.toBe("duplicate");
		expect(thread.isCancelled(1)).toBe(true);
	});
});
