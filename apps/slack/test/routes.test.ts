import { beforeEach, describe, expect, it } from "vitest";
import { clearUserFactsCache } from "../src/access";
import { createApp } from "../src/index";
import { encryptSlackSecrets } from "../src/lib/slack-secrets";
import { signSlackRequest } from "../src/signature";
import type { TurnRunner } from "../src/turns";
import {
	COMPANY_APP_ID,
	COMPANY_APP_ROW_ID,
	COMPANY_SIGNING_SECRET,
	eventEnvelope,
	HOSTED_APP_ID,
	HOSTED_SIGNING_SECRET,
	INSTALLATION_ID,
	installationRow,
	mention,
	TEAM_ID,
	TEST_ENCRYPTION_KEY,
	testWorld,
	type TestWorld,
} from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);

let world: TestWorld;
let waits: Promise<unknown>[];

function executionCtx(): ExecutionContext {
	return { waitUntil: (promise: Promise<unknown>) => void waits.push(promise), passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext;
}

async function signed(path: string, body: string, options: { secret?: string; timestamp?: number; headers?: Record<string, string>; contentType?: string } = {}) {
	const timestamp = options.timestamp ?? NOW_SECONDS;
	const signature = await signSlackRequest(options.secret ?? HOSTED_SIGNING_SECRET, timestamp, body);
	const app = createApp(() => world.deps);
	return app.request(path, {
		method: "POST",
		body,
		headers: {
			"Content-Type": options.contentType ?? "application/json",
			"X-Slack-Request-Timestamp": String(timestamp),
			"X-Slack-Signature": signature,
			...options.headers,
		},
	}, world.env, executionCtx());
}

async function settled() {
	const results = await Promise.all(waits);
	waits = [];
	return results;
}

beforeEach(async () => {
	world = testWorld({ now: NOW });
	waits = [];
	clearUserFactsCache();
	world.db.tables.slack_installations.push(await installationRow());
});

describe("routes", () => {
	it("answers /health", async () => {
		const response = await createApp(() => world.deps).request("/health", {}, world.env, executionCtx());
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, service: "phaseo-slack-agent" });
	});

	it("answers Slack's url_verification challenge, signed", async () => {
		const body = JSON.stringify({ token: "deprecated", challenge: "test-challenge-123", type: "url_verification" });
		const response = await signed("/events", body);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ challenge: "test-challenge-123" });
	});

	it("refuses unsigned, wrongly signed and stale requests", async () => {
		const body = JSON.stringify(eventEnvelope(mention()));
		const app = createApp(() => world.deps);
		const unsigned = await app.request("/events", { method: "POST", body }, world.env, executionCtx());
		expect(unsigned.status).toBe(401);
		expect((await signed("/events", body, { secret: "another-secret" })).status).toBe(401);
		// A captured request replayed six minutes later.
		expect((await signed("/events", body, { timestamp: NOW_SECONDS - 6 * 60 })).status).toBe(401);
		expect(waits).toHaveLength(0);
		expect(world.threads.instances.size).toBe(0);
	});

	it("acknowledges an event at once and handles it after the response", async () => {
		const response = await signed("/events", JSON.stringify(eventEnvelope(mention())));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		await expect(settled()).resolves.toEqual(["started"]);
		const thread = world.threads.get(world.threads.idFromName(`${INSTALLATION_ID}:C0CHANNEL1:1792600000.000100`));
		expect(thread.status()).toEqual({ running: 1, queued: 0, events: 1, memory: 0 });
		// The turn runs as a Workflow instance whose params hold ids, never the message.
		expect(world.turns.created.map((entry) => entry.id)).toEqual(["turn-Ev0TEST0001"]);
		expect(JSON.stringify(world.turns.created)).not.toContain("what did we spend");
	});

	it("acknowledges Slack's retries and replays inside the window, and handles the event once", async () => {
		const body = JSON.stringify(eventEnvelope(mention()));
		expect((await signed("/events", body)).status).toBe(200);
		const retry = await signed("/events", body, { headers: { "X-Slack-Retry-Num": "1", "X-Slack-Retry-Reason": "http_timeout" } });
		expect(retry.status).toBe(200);
		const replay = await signed("/events", body);
		expect(replay.status).toBe(200);
		await expect(settled()).resolves.toEqual(["started", "duplicate", "duplicate"]);
		const meter = world.meters.get(world.meters.idFromName(INSTALLATION_ID));
		expect(meter.usage(NOW)).toMatchObject({ people: 1, pending: 1 });
		expect(world.turns.created).toHaveLength(1);
	});

	it("handles the app being removed in Slack before answering, and asks Slack to retry when the database is down", async () => {
		const body = JSON.stringify(eventEnvelope({ type: "app_uninstalled" }, { event_id: "Ev0REMOVED01" }));
		world.db.failingRpcs.add("uninstall_slack_agent_from_slack");
		const failed = await signed("/events", body);
		expect(failed.status).toBe(500);
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "active" });
		world.db.failingRpcs.clear();
		const retried = await signed("/events", body, { headers: { "X-Slack-Retry-Num": "1", "X-Slack-Retry-Reason": "http_error" } });
		expect(retried.status).toBe(200);
		expect(world.db.tables.slack_installations[0]).toMatchObject({ status: "uninstalled" });
		// The uninstall itself is done before answering; only the internal alert runs after.
		expect(waits).toHaveLength(1);
	});

	it("refuses an event for another app", async () => {
		const response = await signed("/events", JSON.stringify(eventEnvelope(mention(), { api_app_id: "A0SOMEONE1" })));
		expect(response.status).toBe(403);
		expect(response.headers.get("x-slack-no-retry")).toBe("1");
		expect(waits).toHaveLength(0);
	});

	it("is unavailable until the hosted app's signing secret is set", async () => {
		world.env.SLACK_SIGNING_SECRET = undefined;
		expect((await signed("/events", JSON.stringify(eventEnvelope(mention())))).status).toBe(503);
	});

	it("verifies a company's own app with its signing secret from slack_apps and finds its installation", async () => {
		world.db.tables.slack_installations = [await installationRow({ slack_app_id: COMPANY_APP_ROW_ID })];
		world.db.tables.slack_apps.push({
			id: COMPANY_APP_ROW_ID,
			slack_app_id: COMPANY_APP_ID,
			client_id: "1111111111.2222222222",
			verified_at: "2026-11-01T00:00:00Z",
			secrets_ciphertext: await encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { client_secret: "test-client-secret", signing_secret: COMPANY_SIGNING_SECRET }),
		});
		const body = JSON.stringify(eventEnvelope(mention(), { api_app_id: COMPANY_APP_ID }));
		// The hosted app's secret doesn't sign for a company app.
		expect((await signed(`/events/${COMPANY_APP_ID}`, body)).status).toBe(401);
		expect((await signed(`/events/${COMPANY_APP_ID}`, body, { secret: COMPANY_SIGNING_SECRET })).status).toBe(200);
		await expect(settled()).resolves.toEqual(["started"]);
		const lookup = world.db.queries.find((query) => query.table === "slack_installations");
		expect(lookup?.query).toMatchObject({ slack_app_id: `eq.${COMPANY_APP_ROW_ID}`, team_id: `eq.${TEAM_ID}`, status: "neq.uninstalled" });
		// The same team through the hosted app has no installation.
		expect((await signed("/events", JSON.stringify(eventEnvelope(mention(), { event_id: "Ev0TEST0002" })))).status).toBe(200);
		await expect(settled()).resolves.toEqual(["no_installation"]);
	});

	it("routes a company app's events by signing secret when another workspace saved the same app id", async () => {
		const squatterRowId = "99999999-9999-4999-8999-999999999999";
		world.db.tables.slack_installations = [await installationRow({ slack_app_id: COMPANY_APP_ROW_ID })];
		// Saved first, by a workspace that doesn't own the Slack app and so has a different signing secret.
		world.db.tables.slack_apps.push({
			id: squatterRowId,
			slack_app_id: COMPANY_APP_ID,
			client_id: "3333333333.4444444444",
			verified_at: null,
			secrets_ciphertext: await encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { client_secret: "other-client-secret", signing_secret: "squatter-signing-secret" }),
		}, {
			id: COMPANY_APP_ROW_ID,
			slack_app_id: COMPANY_APP_ID,
			client_id: "1111111111.2222222222",
			verified_at: "2026-11-04T00:00:00Z",
			secrets_ciphertext: await encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { client_secret: "test-client-secret", signing_secret: COMPANY_SIGNING_SECRET }),
		});
		const body = JSON.stringify(eventEnvelope(mention(), { api_app_id: COMPANY_APP_ID }));
		expect((await signed(`/events/${COMPANY_APP_ID}`, body, { secret: COMPANY_SIGNING_SECRET })).status).toBe(200);
		await expect(settled()).resolves.toEqual(["started"]);
		expect(world.db.queries.find((query) => query.table === "slack_installations")?.query).toMatchObject({ slack_app_id: `eq.${COMPANY_APP_ROW_ID}` });
		expect((await signed(`/events/${COMPANY_APP_ID}`, body, { secret: "not-either-secret" })).status).toBe(401);
	});

	describe("a saved company app's own request URL", () => {
		const secrets = (signing: string) => encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { client_secret: "client-secret", signing_secret: signing });
		const squatterRow = (index: number) => `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`;
		const challenge = JSON.stringify({ type: "url_verification", challenge: "owner-challenge", token: "x" });
		async function saveHundredSquattersThenOwner() {
			// Saved before the owner, from 100 other workspaces, with secrets of their own.
			for (let index = 1; index <= 100; index += 1) {
				world.db.tables.slack_apps.push({ id: squatterRow(index), slack_app_id: COMPANY_APP_ID, client_id: `${index}.${index}`, verified_at: null, secrets_ciphertext: await secrets(`squatter-signing-secret-${index}`) });
			}
			world.db.tables.slack_apps.push({ id: COMPANY_APP_ROW_ID, slack_app_id: COMPANY_APP_ID, client_id: "1111111111.2222222222", verified_at: null, secrets_ciphertext: await secrets(COMPANY_SIGNING_SECRET) });
		}

		it("answers the owner's URL verification on its own URL however many squatters saved the app id first", async () => {
			await saveHundredSquattersThenOwner();
			const response = await signed(`/apps/${COMPANY_APP_ROW_ID}/events`, challenge, { secret: COMPANY_SIGNING_SECRET });
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ challenge: "owner-challenge" });
			const lookup = world.db.queries.filter((query) => query.table === "slack_apps").at(-1);
			expect(lookup?.query).toMatchObject({ id: `eq.${COMPANY_APP_ROW_ID}` });
		});

		it("doesn't let a squatter's URL verify for another row", async () => {
			await saveHundredSquattersThenOwner();
			expect((await signed(`/apps/${squatterRow(1)}/events`, challenge, { secret: COMPANY_SIGNING_SECRET })).status).toBe(401);
			expect((await signed(`/apps/${squatterRow(1)}/events`, challenge, { secret: "squatter-signing-secret-1" })).status).toBe(200);
			expect((await signed("/apps/not-a-row/events", challenge, { secret: COMPANY_SIGNING_SECRET })).status).toBe(404);
		});

		it("never tries unverified secrets on the shared URL, and serves the verified app there", async () => {
			await saveHundredSquattersThenOwner();
			for (const secret of [COMPANY_SIGNING_SECRET, "squatter-signing-secret-1"]) {
				expect((await signed(`/events/${COMPANY_APP_ID}`, challenge, { secret })).status).toBe(404);
			}
			for (const query of world.db.queries.filter((entry) => entry.table === "slack_apps")) expect(query.query).toMatchObject({ verified_at: "not.is.null" });
			// Once the owner's install verifies the app, the shared URL takes only its secret.
			world.db.tables.slack_apps.find((row) => row.id === COMPANY_APP_ROW_ID)!.verified_at = "2026-11-10T00:00:00Z";
			expect((await signed(`/events/${COMPANY_APP_ID}`, challenge, { secret: "squatter-signing-secret-1" })).status).toBe(401);
			expect((await signed(`/events/${COMPANY_APP_ID}`, challenge, { secret: COMPANY_SIGNING_SECRET })).status).toBe(200);
		});

		it("routes events and button clicks on the row's URL to its installation", async () => {
			world.db.tables.slack_installations = [await installationRow({ slack_app_id: COMPANY_APP_ROW_ID })];
			await saveHundredSquattersThenOwner();
			const body = JSON.stringify(eventEnvelope(mention(), { api_app_id: COMPANY_APP_ID }));
			expect((await signed(`/apps/${COMPANY_APP_ROW_ID}/events`, body, { secret: COMPANY_SIGNING_SECRET })).status).toBe(200);
			await expect(settled()).resolves.toEqual(["started"]);
			// The row's own app id still has to match the event's.
			const other = JSON.stringify(eventEnvelope(mention(), { api_app_id: "A0SOMEONE1", event_id: "Ev0TEST0003" }));
			expect((await signed(`/apps/${COMPANY_APP_ROW_ID}/events`, other, { secret: COMPANY_SIGNING_SECRET })).status).toBe(403);
		});
	});

	it("looks hosted installations up by team with no app", async () => {
		await signed("/events", JSON.stringify(eventEnvelope(mention())));
		await settled();
		expect(world.db.queries.find((query) => query.table === "slack_installations")?.query).toMatchObject({ slack_app_id: "is.null", team_id: `eq.${TEAM_ID}` });
	});

	it("returns 404 for an unknown company app and a malformed app id", async () => {
		const body = JSON.stringify(eventEnvelope(mention(), { api_app_id: "A0UNKNOWN1" }));
		expect((await signed("/events/A0UNKNOWN1", body)).status).toBe(404);
		expect((await signed("/events/not-an-app", body)).status).toBe(404);
	});

	it("stops a thread from its Cancel button", async () => {
		const key = `${INSTALLATION_ID}:C0CHANNEL1:1792600000.000100`;
		const thread = world.threads.get(world.threads.idFromName(key));
		const runner: TurnRunner = { start: async () => ({ started: true }) };
		thread.runner = runner;
		await signed("/events", JSON.stringify(eventEnvelope(mention())));
		await expect(settled()).resolves.toEqual(["started"]);
		expect(thread.status().running).toBe(1);

		const payload = {
			type: "block_actions",
			api_app_id: HOSTED_APP_ID,
			team: { id: TEAM_ID },
			user: { id: "U0PERSON01", team_id: TEAM_ID },
			channel: { id: "C0CHANNEL1" },
			actions: [{ action_id: "cancel_turn", value: "1792600000.000100" }],
		};
		const response = await signed("/interactions", new URLSearchParams({ payload: JSON.stringify(payload) }).toString(), { contentType: "application/x-www-form-urlencoded" });
		expect(response.status).toBe(200);
		await expect(settled()).resolves.toEqual(["cancelled"]);
		expect(thread.isCancelled(1)).toBe(true);
	});

	it("acknowledges Connect account and feedback clicks without doing anything", async () => {
		for (const actionId of ["connect_account", "feedback_good"]) {
			const payload = { type: "block_actions", api_app_id: HOSTED_APP_ID, team: { id: TEAM_ID }, actions: [{ action_id: actionId }] };
			const response = await signed("/interactions", new URLSearchParams({ payload: JSON.stringify(payload) }).toString(), { contentType: "application/x-www-form-urlencoded" });
			expect(response.status).toBe(200);
		}
		await expect(settled()).resolves.toEqual(["acknowledged", "acknowledged"]);
	});

	it("closes the Other form at once with an empty 200, and takes the answer after", async () => {
		const payload = {
			type: "view_submission",
			api_app_id: HOSTED_APP_ID,
			team: { id: TEAM_ID },
			user: { id: "U0PERSON01", team_id: TEAM_ID },
			view: { callback_id: "question_other", private_metadata: "C0CHANNEL1|1792600000.000100|1|1", state: { values: { answer: { answer: { value: "Friday" } } } } },
		};
		const response = await signed("/interactions", new URLSearchParams({ payload: JSON.stringify(payload) }).toString(), { contentType: "application/x-www-form-urlencoded" });
		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("");
		// No turn waits on that question here: they're told privately it's closed.
		await expect(settled()).resolves.toEqual(["refused"]);
		expect(world.slack.ephemerals().map((call) => call.args)).toEqual([
			{ channel: "C0CHANNEL1", user: "U0PERSON01", text: "This question is closed, so I can't take an answer to it now. Ask me again in the thread.", thread_ts: "1792600000.000100" },
		]);
	});
});
