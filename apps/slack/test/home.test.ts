import { beforeEach, describe, expect, it } from "vitest";
import { processEvent, type SlackEnvelope } from "../src/events";
import { hostedApp, type Installation } from "../src/installations";
import { BOT_USER_ID, eventEnvelope, INSTALLATION_ID, installationRow, testWorld, WORKSPACE_ID, type TestWorld } from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const USER = "00000000-0000-4000-8000-0000000000d1";

let world: TestWorld;
let counter = 0;

async function install(overrides: Partial<Installation> = {}) {
	world.db.tables.slack_installations = [await installationRow(overrides)];
}

function openHome(overrides: Record<string, unknown> = {}) {
	const event = { type: "app_home_opened", user: "U0PERSON01", channel: "D0DIRECT01", tab: "home", event_ts: "1792600000.000300", ...overrides };
	return processEvent(world.deps, hostedApp(world.env)!, eventEnvelope(event, { event_id: `Ev0HOME${String((counter += 1)).padStart(4, "0")}` }) as SlackEnvelope);
}

type Block = { type: string; text?: { text: string }; fields?: Array<{ text: string }>; elements?: Array<Record<string, unknown>> };

function published(): { userId: unknown; blocks: Block[]; text: string } {
	const call = world.slack.of("views.publish").at(-1)!;
	const view = call.args.view as { type: string; blocks: Block[] };
	expect(view.type).toBe("home");
	return { userId: call.args.user_id, blocks: view.blocks, text: JSON.stringify(view.blocks) };
}

const fields = (blocks: Block[]) => blocks.flatMap((block) => block.fields ?? []).map((field) => field.text);

/** Holds places and counts answers in the installation's meter, as finished turns do. */
function answered(count: number) {
	const meter = world.meters.get(world.meters.idFromName(INSTALLATION_ID));
	for (let index = 0; index < count; index += 1) {
		const eventId = `Ev0ANSWER${String(index).padStart(3, "0")}`;
		meter.admit({
			settings: { id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, status: "active", plan_people: 100, over_plan: "refuse", max_people: null, monthly_cap_nanos: 100_000_000_000, answers_per_person_hour: 60, allow_guests: true, allow_external_users: false },
			slackUserId: `U0PERSON${String(index % 3).padStart(2, "0")}`,
			facts: { isBot: false, isExternal: false, isGuest: false },
			eventId,
			now: NOW,
		});
		void meter.recordAnswer({ eventId, slackUserId: `U0PERSON${String(index % 3).padStart(2, "0")}`, now: NOW });
	}
}

beforeEach(async () => {
	world = testWorld({ now: NOW });
	await install();
	world.db.tables.v2_models.push({ model_slug: "anthropic/claude-test", name: "Claude Test", hidden: false });
});

describe("the Home tab", () => {
	it("tells someone who isn't linked how to use the agent, its model, and offers the Connect button", async () => {
		await expect(openHome()).resolves.toBe("home_published");
		const home = published();
		expect(home.userId).toBe("U0PERSON01");
		expect(home.blocks[0]).toEqual({ type: "header", text: { type: "plain_text", text: "Phaseo agent" } });
		expect(home.text).toContain(`invite <@${BOT_USER_ID}> to the channel, then mention it`);
		expect(home.text).toContain("it asks with buttons. Only you can answer, within an hour");
		expect(fields(home.blocks)).toEqual(["*Model*\nAuto", "*Your Phaseo account*\nNot connected"]);
		const button = home.blocks.flatMap((block) => block.elements ?? []).find((element) => element.action_id === "connect_account")!;
		const url = new URL(String(button.url));
		expect(`${url.origin}${url.pathname}`).toBe("https://phaseo.app/slack/link");
		expect(url.searchParams.get("token")).toBeTruthy();
		expect(home.text).toContain("<https://phaseo.app/settings/slack|Phaseo settings>");
	});

	it("shows a linked member this month's answers in the workspace, and the model's catalogue name", async () => {
		await install({ model: "anthropic/claude-test" });
		world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
		world.db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
		answered(1_204);
		await openHome();
		const home = published();
		expect(fields(home.blocks)).toEqual(["*Model*\nClaude Test", "*Your Phaseo account*\nConnected", "*This month (UTC)*\n1,204 answers in this Slack workspace"]);
		expect(home.text).not.toContain("connect_account");
	});

	it("shows no counts to someone linked to an account outside the workspace, and no button where connecting wouldn't help", async () => {
		await install({ usage_data_mode: "off" });
		await openHome();
		expect(published().text).not.toContain("connect_account");
		expect(published().text).not.toContain("ask about its spend");

		world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
		answered(3);
		await openHome();
		const home = published();
		expect(fields(home.blocks)).toEqual(["*Model*\nAuto", "*Your Phaseo account*\nConnected"]);
		expect(home.text).toContain("isn't a member of the workspace that added the agent");
	});

	it("lists the models people may choose per message, only when admins turned that on", async () => {
		await openHome();
		expect(published().text).not.toContain("Choose a model");
		world.db.tables.v2_models.push({ model_slug: "openai/gpt-6-luna", name: "GPT-6 Luna & <Co>", hidden: false });
		await install({ model_choice_enabled: true, allowed_models: ["anthropic/claude-test", "openai/gpt-6-luna"] });
		await openHome();
		expect(published().text).toContain("*Choose a model:* start a message with `with &lt;model&gt;:` and one of Claude Test, GPT-6 Luna &amp; &lt;Co&gt;, for example `with Claude Test: …`.");
	});

	it("says when the agent is paused", async () => {
		await install({ status: "paused" });
		await openHome();
		expect(published().text).toContain("The agent is paused in this Slack workspace.");
	});

	it("ignores the Messages tab, and events it can't place", async () => {
		await expect(openHome({ tab: "messages" })).resolves.toBe("ignored");
		await expect(openHome({ user: "not-a-user" })).resolves.toBe("ignored");
		await expect(openHome({ user: BOT_USER_ID })).resolves.toBe("ignored_self");
		world.db.tables.slack_installations = [];
		await expect(openHome()).resolves.toBe("no_installation");
		expect(world.slack.of("views.publish")).toHaveLength(0);
	});

	it("reports when Slack doesn't take the view, and never puts message text in it", async () => {
		world.slack.failures.set("views.publish", ["invalid_blocks"]);
		await expect(openHome()).resolves.toBe("error");
		await openHome();
		expect(published().text).not.toMatch(/what did we spend|hello/);
	});
});
