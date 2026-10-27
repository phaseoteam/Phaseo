import { connectAccountMessage, linkUrl, webOrigin } from "./access";
import { isAutoModel } from "./agent";
import type { Env } from "./env";
import type { Installation } from "./installations";
import type { SlackClient } from "./slack-api";
import type { Db } from "./supabase";
import { isWorkspaceMember, linkedUserId } from "./usage-tools";

// The app's Home tab (app_home_opened, tab "home"): what the agent is and how to
// use it, the agent's model, whether this person's Phaseo account is connected
// (with the Connect button when connecting would help), and this month's answers
// for someone linked to a member of the workspace. Published for the one person
// with views.publish each time they open the tab. It shows settings and counts,
// never message text.

export type HomeAccount = "member" | "linked" | "not_linked";

export type HomeFacts = {
	installation: Pick<Installation, "bot_user_id" | "status" | "access_mode" | "usage_data_mode">;
	/** The model's catalogue name, or Auto. */
	model: string;
	account: HomeAccount;
	/** The Connect button's link, when connecting would let them use the agent or ask about usage. */
	connectUrl: string | null;
	/** This UTC month's answers in the Slack workspace, for a linked member. */
	answers: number | null;
	settingsUrl: string;
};

function section(text: string) {
	return { type: "section", text: { type: "mrkdwn", text } };
}

/** The Home tab's view. */
export function homeView(facts: HomeFacts) {
	const { installation } = facts;
	const bot = `<@${installation.bot_user_id}>`;
	const usage = installation.usage_data_mode !== "off";
	const blocks: unknown[] = [
		{ type: "header", text: { type: "plain_text", text: "Phaseo agent" } },
		section(`Ask the Phaseo agent questions here in Slack. It answers with the model your Phaseo workspace chose, and can search the web and read web pages.${usage ? " Members of the Phaseo workspace who connect their account can also ask about its spend, credits, API key usage and models." : ""}`),
	];
	if (installation.status === "paused") blocks.push(section("_The agent is paused in this Slack workspace. An admin can turn it back on in Phaseo settings._"));
	else if (installation.status === "payment_due") blocks.push(section("_The agent is paused until this workspace's Phaseo bill is paid. An admin can add credits in Phaseo billing._"));
	blocks.push(
		{ type: "divider" },
		section([
			"*How to use it*",
			"• *Direct message:* write to it in the *Messages* tab. It answers every message.",
			`• *In a channel:* invite ${bot} to the channel, then mention it. It replies in a thread; mention it again for each follow-up.`,
			"• *Questions:* when it needs you to choose or approve something, it asks with buttons. Only you can answer, within an hour, with a button or a reply in the thread.",
			"• *Stop:* Slack's stop button stops the answer it's working on.",
		].join("\n")),
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Model*\n${facts.model}` },
				{ type: "mrkdwn", text: `*Your Phaseo account*\n${facts.account === "not_linked" ? "Not connected" : "Connected"}` },
				...(facts.answers !== null ? [{ type: "mrkdwn", text: `*This month (UTC)*\n${facts.answers.toLocaleString("en-US")} ${facts.answers === 1 ? "answer" : "answers"} in this Slack workspace` }] : []),
			],
		},
	);
	if (facts.account === "not_linked" && facts.connectUrl) {
		blocks.push(...connectAccountMessage(facts.connectUrl, installation.access_mode === "linked" ? "access" : "usage").blocks);
	} else if (facts.account === "linked") {
		blocks.push(section("_Your Slack account is connected to a Phaseo account that isn't a member of the workspace that added the agent, so it can't share that workspace's usage with you._"));
	}
	blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Owners and admins choose the agent's model, who can use it and its limits in <${facts.settingsUrl}|Phaseo settings>. Phaseo's logs keep no message content.` }] });
	return { type: "home", blocks };
}

/** The model's catalogue name; Auto for Phaseo's auto router (also the default); its id when the catalogue can't say. */
async function modelName(db: Db, model: string | null): Promise<string> {
	if (!model?.trim() || isAutoModel(model)) return "Auto";
	const rows = await db.select<{ name: string | null }>("v2_models", { select: "name", model_slug: `eq.${model}`, limit: "1" }).catch(() => []);
	return rows[0]?.name?.trim() || model;
}

/** Publishes the Home tab for one person. Returns whether Slack took it. */
export async function publishHome(input: {
	env: Env;
	db: Db;
	slack: SlackClient;
	installation: Installation;
	slackUserId: string;
	answersThisMonth: () => Promise<number>;
	now: number;
}): Promise<boolean> {
	const { env, db, installation, slackUserId } = input;
	const userId = await linkedUserId(db, installation.id, slackUserId);
	const member = userId !== null && await isWorkspaceMember(db, installation.workspace_id, userId);
	const account: HomeAccount = member ? "member" : userId ? "linked" : "not_linked";
	// Connecting helps where only linked accounts get answers, or where linked members can ask about usage.
	const connectUrl = account === "not_linked" && (installation.access_mode === "linked" || installation.usage_data_mode !== "off")
		? await linkUrl(env, installation.id, slackUserId, input.now)
		: null;
	let answers: number | null = null;
	if (member) {
		try {
			answers = await input.answersThisMonth();
		} catch {
			console.error("[slack-agent] home tab answers not read", { installationId: installation.id });
		}
	}
	const view = homeView({
		installation,
		model: await modelName(db, installation.model),
		account,
		connectUrl,
		answers,
		settingsUrl: new URL("/settings/slack", webOrigin(env)).toString(),
	});
	const published = await input.slack.call("views.publish", { user_id: slackUserId, view });
	return published.ok;
}
