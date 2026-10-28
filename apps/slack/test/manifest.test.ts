import { beforeEach, describe, expect, it } from "vitest";
import { SLACK_AGENT_BOT_SCOPES, SLACK_AGENT_ORIGINAL_BOT_SCOPES } from "../../web-api/src/lib/slack-api";
import { ORIGINAL_BOT_SCOPES } from "../src/installations";
import { processEvent, type SlackEnvelope } from "../src/events";
import { createApp } from "../src/index";
import { hostedApp } from "../src/installations";
import { SIGN_IN_PATH } from "../src/page-viewer";
import { encryptSlackSecrets } from "../src/lib/slack-secrets";
import { signSlackRequest } from "../src/signature";
import {
	BOT_USER_ID,
	COMPANY_APP_ID,
	COMPANY_APP_ROW_ID,
	COMPANY_SIGNING_SECRET,
	directMessage,
	eventEnvelope,
	HOSTED_APP_ID,
	HOSTED_SIGNING_SECRET,
	mention,
	TEST_ENCRYPTION_KEY,
	testWorld,
	type TestWorld,
} from "./fakes";

// apps/slack/manifest.json is the hosted Slack app's manifest. The Slack agent
// guide prints the same manifest in every docs language, with YOUR_APP_ID in the
// request URLs, for companies that use their own Slack app. These checks keep
// both in step with the code: the bot scopes web-api asks for at install, the
// events this Worker handles, the OAuth redirects (install, and Sign in with
// Slack for shared pages), and the production host and routes Slack sends
// requests to.

type Manifest = {
	features: { agent_view?: { agent_description?: string }; assistant_view?: unknown; app_home?: Record<string, boolean> };
	oauth_config: { redirect_urls: string[]; scopes: { bot: string[]; user?: string[] } };
	settings: {
		event_subscriptions: { request_url: string; bot_events: string[]; user_events?: string[] };
		interactivity: { is_enabled: boolean; request_url: string };
		org_deploy_enabled: boolean;
		socket_mode_enabled: boolean;
		token_rotation_enabled: boolean;
	};
};

const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } })
	.process.getBuiltinModule("node:fs") as { readFileSync(path: URL, encoding: "utf8"): string };
const testFile = (import.meta as unknown as { url: string }).url;

function read(path: string): string {
	return readFileSync(new URL(path, testFile), "utf8");
}

const manifest = JSON.parse(read("../manifest.json")) as Manifest;

/** The docs guide's languages: English at the root, then each translation's folder. */
const DOCS_LOCALES = ["", "ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"];
const PLACEHOLDER = "YOUR_APP_ID";

function docsManifest(locale: string): Manifest {
	const page = read(`../../docs/${locale ? `${locale}/` : ""}v1/guides/slack-agent.mdx`);
	const blocks = [...page.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]).filter((block) => block.includes("\"agent_view\""));
	expect(blocks, `${locale || "en"} guide prints the manifest once`).toHaveLength(1);
	return JSON.parse(blocks[0]) as Manifest;
}

/** The event each manifest subscription delivers, as Slack sends it (message.im arrives as a message with channel_type "im"). */
const DELIVERED: Record<string, Record<string, unknown>> = {
	app_mention: mention(),
	"message.im": directMessage(),
	agent_session_stopped: { type: "agent_session_stopped", user: "U0PERSON01", channel: "C0CHANNEL1", thread_ts: "1792600000.000100", streaming_message_ts: [], event_ts: "1792600001.000100" },
	app_uninstalled: { type: "app_uninstalled" },
	tokens_revoked: { type: "tokens_revoked", tokens: { oauth: [], bot: [BOT_USER_ID] } },
	app_home_opened: { type: "app_home_opened", user: "U0PERSON01", channel: "D0DIRECT01", tab: "home", event_ts: "1792600000.000300" },
};

/**
 * Events the app does not subscribe to, and the one subscribed event it leaves
 * alone (opening the Messages tab). The Worker must ignore them, or the
 * manifest is missing a subscription.
 */
const NOT_SUBSCRIBED: Record<string, unknown>[] = [
	directMessage({ channel_type: "channel", channel: "C0CHANNEL1" }),
	directMessage({ channel_type: "group", channel: "G0GROUP001" }),
	directMessage({ channel_type: "mpim", channel: "G0MPIM0001" }),
	{ type: "app_home_opened", user: "U0PERSON01", channel: "D0DIRECT01", tab: "messages", event_ts: "1792600000.000300" },
	{ type: "assistant_thread_started", assistant_thread: { user_id: "U0PERSON01", channel_id: "D0DIRECT01", thread_ts: "1792600000.000400" } },
	{ type: "agent_session_title_changed", user: "U0PERSON01", channel: "C0CHANNEL1", thread_ts: "1792600000.000100", title: "Spend" },
	{ type: "app_context_changed", user: "U0PERSON01", channel: "D0DIRECT01" },
	{ type: "reaction_added", user: "U0PERSON01", reaction: "thumbsup", item: { type: "message", channel: "C0CHANNEL1", ts: "1792600000.000100" } },
	{ type: "member_joined_channel", user: "U0PERSON01", channel: "C0CHANNEL1" },
];

const ROUTE_NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

let world: TestWorld;

beforeEach(async () => {
	world = testWorld({ now: ROUTE_NOW });
	world.db.tables.slack_apps.push({
		id: COMPANY_APP_ROW_ID,
		slack_app_id: COMPANY_APP_ID,
		client_id: "1111111111.2222222222",
		secrets_ciphertext: await encryptSlackSecrets({ SLACK_SECRETS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY }, { client_secret: "test-client-secret", signing_secret: COMPANY_SIGNING_SECRET }),
	});
});

/** A request signed the way Slack signs it, sent to the path of a manifest URL. */
async function slackRequest(url: string, body: string, secret: string, contentType = "application/json") {
	const timestamp = Math.floor(ROUTE_NOW / 1000);
	const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext;
	return createApp(() => world.deps).request(new URL(url).pathname, {
		method: "POST",
		body,
		headers: {
			"Content-Type": contentType,
			"X-Slack-Request-Timestamp": String(timestamp),
			"X-Slack-Signature": await signSlackRequest(secret, timestamp, body),
		},
	}, world.env, executionCtx);
}

describe("Slack app manifest", () => {
	it("reads an installation from before its scopes were recorded as having the scopes web-api assumes", () => {
		expect([...ORIGINAL_BOT_SCOPES]).toEqual([...SLACK_AGENT_ORIGINAL_BOT_SCOPES]);
	});

	it("asks for exactly the bot scopes web-api requests at install, and no user scopes", () => {
		expect(manifest.oauth_config.scopes.bot).toEqual([...SLACK_AGENT_BOT_SCOPES]);
		expect(manifest.oauth_config.scopes.user).toBeUndefined();
	});

	it("registers web-api's OAuth callback and the shared pages' Sign in with Slack redirect, and nothing else", () => {
		const source = read("../../web-api/src/routes/account/settings-slack.ts");
		const origin = source.match(/const DEFAULT_WEB_ORIGIN = "([^"]+)"/)?.[1];
		const path = source.match(/const CALLBACK_PATH = "([^"]+)"/)?.[1];
		expect(origin && path).toBeTruthy();
		// The production Worker's PUBLIC_ORIGIN and the path page-viewer.ts sends Slack.
		const publicOrigin = read("../wrangler.jsonc").match(/"PUBLIC_ORIGIN":\s*"([^"]+)"/)?.[1];
		expect(publicOrigin).toBe("https://slack.phaseo.app");
		expect(manifest.oauth_config.redirect_urls).toEqual([`${origin}${path}`, `${publicOrigin}${SIGN_IN_PATH}`]);
	});

	it("subscribes to exactly the bot events the Worker handles", async () => {
		expect([...manifest.settings.event_subscriptions.bot_events].sort()).toEqual(Object.keys(DELIVERED).sort());
		expect(manifest.settings.event_subscriptions.user_events).toBeUndefined();
		let count = 0;
		const run = (event: Record<string, unknown>) => processEvent(
			world.deps,
			hostedApp(world.env)!,
			eventEnvelope(event, { event_id: `Ev0MANIFEST${String((count += 1)).padStart(3, "0")}` }) as SlackEnvelope,
		);
		const lookups = () => world.db.queries.filter((entry) => entry.table === "slack_installations").length;

		for (const name of manifest.settings.event_subscriptions.bot_events) {
			const before = lookups();
			// No installation exists, so a handled event gets as far as looking for one.
			await expect(run(DELIVERED[name]), name).resolves.toBe("no_installation");
			expect(lookups(), name).toBeGreaterThan(before);
		}
		for (const event of NOT_SUBSCRIBED) {
			const before = lookups();
			await expect(run(event), String(event.type)).resolves.toBe("ignored");
			expect(lookups(), String(event.type)).toBe(before);
		}
	});

	it("uses the agent messaging experience with a writable Messages tab, and a Home tab", () => {
		expect(manifest.features.agent_view?.agent_description?.length).toBeGreaterThan(0);
		expect(manifest.features.agent_view!.agent_description!.length).toBeLessThanOrEqual(300);
		expect(manifest.features.assistant_view).toBeUndefined();
		expect(manifest.features.app_home).toEqual({ home_tab_enabled: true, messages_tab_enabled: true, messages_tab_read_only_enabled: false });
	});

	it("keeps token rotation off and uses HTTP request URLs, not Socket Mode", () => {
		// Slack can't turn rotation off again once it's on, and the hosted app's client
		// credentials (needed to refresh rotating tokens) are optional Worker secrets.
		expect(manifest.settings.token_rotation_enabled).toBe(false);
		expect(manifest.settings.socket_mode_enabled).toBe(false);
		expect(manifest.settings.interactivity.is_enabled).toBe(true);
	});

	it("points Slack at the production Worker's host", () => {
		const wrangler = read("../wrangler.jsonc");
		const host = wrangler.match(/"pattern":\s*"([^"]+)",\s*"custom_domain":\s*true/)?.[1];
		expect(host).toBe("slack.phaseo.app");
		expect(manifest.settings.event_subscriptions.request_url).toBe(`https://${host}/events`);
		expect(manifest.settings.interactivity.request_url).toBe(`https://${host}/interactions`);
	});

	it("passes Slack's request URL check and accepts button clicks on the hosted app's routes", async () => {
		const challenge = JSON.stringify({ token: "deprecated", challenge: "manifest-challenge", type: "url_verification" });
		const verified = await slackRequest(manifest.settings.event_subscriptions.request_url, challenge, HOSTED_SIGNING_SECRET);
		expect(verified.status).toBe(200);
		await expect(verified.json()).resolves.toEqual({ challenge: "manifest-challenge" });

		const click = `payload=${encodeURIComponent(JSON.stringify({ type: "block_actions", api_app_id: HOSTED_APP_ID, actions: [{ action_id: "feedback_up" }] }))}`;
		const clicked = await slackRequest(manifest.settings.interactivity.request_url, click, HOSTED_SIGNING_SECRET, "application/x-www-form-urlencoded");
		expect(clicked.status).toBe(200);
	});
});

describe("the manifest in the Slack agent guide", () => {
	it.each(DOCS_LOCALES)("matches manifest.json, with YOUR_APP_ID in the request URLs (%s)", (locale) => {
		const printed = docsManifest(locale);
		expect(printed.settings.event_subscriptions.request_url).toBe(`${manifest.settings.event_subscriptions.request_url}/${PLACEHOLDER}`);
		expect(printed.settings.interactivity.request_url).toBe(`${manifest.settings.interactivity.request_url}/${PLACEHOLDER}`);
		const asHosted = JSON.parse(JSON.stringify(printed).replaceAll(`/${PLACEHOLDER}`, "")) as Manifest;
		expect(asHosted).toEqual(manifest);
	});

	it("routes a company's own app once YOUR_APP_ID is replaced with its app id", async () => {
		const printed = docsManifest("");
		const eventsUrl = printed.settings.event_subscriptions.request_url.replace(PLACEHOLDER, COMPANY_APP_ID);
		const interactionsUrl = printed.settings.interactivity.request_url.replace(PLACEHOLDER, COMPANY_APP_ID);

		const challenge = JSON.stringify({ token: "deprecated", challenge: "company-challenge", type: "url_verification" });
		const verified = await slackRequest(eventsUrl, challenge, COMPANY_SIGNING_SECRET);
		expect(verified.status).toBe(200);
		await expect(verified.json()).resolves.toEqual({ challenge: "company-challenge" });
		// The hosted app's signing secret doesn't sign for a company's app.
		expect((await slackRequest(eventsUrl, challenge, HOSTED_SIGNING_SECRET)).status).toBe(401);

		const click = `payload=${encodeURIComponent(JSON.stringify({ type: "block_actions", api_app_id: COMPANY_APP_ID, actions: [{ action_id: "feedback_up" }] }))}`;
		expect((await slackRequest(interactionsUrl, click, COMPANY_SIGNING_SECRET, "application/x-www-form-urlencoded")).status).toBe(200);
	});
});
