import type { Env } from "./env";
import type { Installation } from "./installations";
import { signSlackToken } from "./lib/slack-secrets";
import { NANOS_PER_USD } from "./lib/slackAgentPricing";
import type { RefuseReason, Tier, UserFacts } from "./meter";
import { usersInfo, type SlackClient, type SlackUser } from "./slack-api";
import type { Db } from "./supabase";

// Who is asking (bot, guest, someone from another organisation), whether they
// have linked their Phaseo account, and the polite replies when they can't get
// an answer.

const FACTS_TTL_MS = 10 * 60_000;
const FACTS_CACHE_LIMIT = 5_000;
/** Link buttons work for 15 minutes, like web-api expects. */
export const LINK_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_WEB_ORIGIN = "https://phaseo.app";

export function userFacts(user: SlackUser, installation: Pick<Installation, "team_id" | "enterprise_id">): UserFacts {
	const sameEnterprise = Boolean(installation.enterprise_id && user.enterprise_user?.enterprise_id === installation.enterprise_id);
	// A workspace install: someone from another workspace, unless it's in the same Enterprise Grid.
	// An org-wide install (no team): anyone who isn't a member of the installation's enterprise,
	// which includes people in shared channels whose is_stranger is false.
	const otherOrganisation = installation.team_id
		? Boolean(user.team_id && user.team_id !== installation.team_id) && !sameEnterprise
		: Boolean(installation.enterprise_id) && !sameEnterprise;
	return {
		isBot: user.is_bot === true || user.id === "USLACKBOT",
		isExternal: user.is_stranger === true || otherOrganisation,
		isGuest: user.is_restricted === true || user.is_ultra_restricted === true,
	};
}

const factsCache = new Map<string, { facts: UserFacts; expiresAt: number }>();

/** users.info, cached briefly per isolate. Null when Slack can't say who this is. */
export async function lookupUserFacts(
	slack: SlackClient,
	installation: Pick<Installation, "id" | "team_id" | "enterprise_id">,
	slackUserId: string,
	now = Date.now(),
): Promise<UserFacts | null> {
	const key = `${installation.id}:${slackUserId}`;
	const cached = factsCache.get(key);
	if (cached && cached.expiresAt > now) return cached.facts;
	const user = await usersInfo(slack, slackUserId);
	if (user.ok === false) return null;
	const facts = userFacts(user.data, installation);
	if (factsCache.size >= FACTS_CACHE_LIMIT) factsCache.delete(factsCache.keys().next().value!);
	factsCache.set(key, { facts, expiresAt: now + FACTS_TTL_MS });
	return facts;
}

export function clearUserFactsCache(): void {
	factsCache.clear();
}

/** Drops what this isolate cached about an installation's people (it was removed in Slack). */
export function forgetInstallationFacts(installationId: string): void {
	for (const key of factsCache.keys()) if (key.startsWith(`${installationId}:`)) factsCache.delete(key);
}

export async function isLinked(db: Db, installationId: string, slackUserId: string): Promise<boolean> {
	const rows = await db.select<{ user_id: string }>("slack_user_links", {
		select: "user_id",
		installation_id: `eq.${installationId}`,
		slack_user_id: `eq.${slackUserId}`,
		limit: "1",
	});
	return rows.length > 0;
}

export function webOrigin(env: Pick<Env, "PHASEO_WEB_ORIGIN" | "ENV">): string {
	const configured = env.PHASEO_WEB_ORIGIN?.trim();
	if (configured) {
		try {
			const url = new URL(configured);
			if (url.protocol === "https:" || (env.ENV !== "production" && url.protocol === "http:")) return url.origin;
		} catch {}
	}
	return DEFAULT_WEB_ORIGIN;
}

/** The account linking page, with a token web-api's POST /api/account/settings/slack/link confirms. */
export async function linkUrl(env: Env, installationId: string, slackUserId: string, now = Date.now()): Promise<string> {
	const token = await signSlackToken(env, "link", { installation_id: installationId, slack_user_id: slackUserId }, LINK_TOKEN_TTL_SECONDS, now);
	const url = new URL("/slack/link", webOrigin(env));
	url.searchParams.set("token", token);
	return url.toString();
}

/**
 * The private Connect button. "access": the installation answers linked accounts
 * only. "usage": anyone may ask, and linking lets the agent answer usage questions.
 */
export function connectAccountMessage(url: string, reason: "access" | "usage" = "access"): { text: string; blocks: unknown[] } {
	const text = reason === "access"
		? "Connect your Phaseo account to use the Phaseo agent here. The button works for 15 minutes."
		: "Connect your Phaseo account so the Phaseo agent can answer questions about this workspace's Phaseo usage. The button works for 15 minutes.";
	return {
		text,
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text } },
			{
				type: "actions",
				elements: [{ type: "button", action_id: "connect_account", style: "primary", text: { type: "plain_text", text: "Connect your Phaseo account" }, url }],
			},
		],
	};
}

function usd(nanos: number): string {
	return `$${(nanos / NANOS_PER_USD).toFixed(2)}`;
}

export type ReplyReason = RefuseReason | "user_unverified" | "busy";

/**
 * What someone sees when they can't get an answer. Null: say nothing (bots, and
 * an app that was removed and can't post). Some refusals are emailed to the
 * workspace's admins, but an email can be suppressed or fail, so the text never
 * says an admin has been told.
 */
export function refusalText(reason: ReplyReason, details: { tier?: Tier; limit?: number } = {}): string | null {
	switch (reason) {
		case "bot":
		case "uninstalled":
			return null;
		case "paused":
			return "The Phaseo agent is paused in this Slack workspace. An admin can turn it back on in Phaseo settings.";
		case "payment_due":
			return "The Phaseo agent is paused until this workspace's Phaseo bill is paid. An admin can add credits in Phaseo billing.";
		case "external_user":
			return "The Phaseo agent only answers people in this organization. An admin can change this in Phaseo settings.";
		case "guest":
			return "The Phaseo agent isn't available to guests in this workspace. An admin can change this in Phaseo settings.";
		case "plan_full":
			return `The Phaseo agent has answered as many people this month as this workspace's plan covers${details.tier ? ` (${details.tier.people.toLocaleString("en-US")} people, ${usd(details.tier.priceNanos)} a month)` : ""}. An admin can move to a bigger plan in Phaseo settings.`;
		case "max_people":
			return "This workspace has reached its Slack agent limit for the month. An admin can change the limits in Phaseo settings.";
		case "monthly_cap":
			return "The Phaseo agent has reached this workspace's monthly spending cap, so answers are paused until next month. An admin can raise the cap in Phaseo settings.";
		case "hourly_limit":
			return `You've reached the limit of ${details.limit != null ? `${details.limit.toLocaleString("en-US")} ` : ""}answers an hour. Please try again a little later.`;
		case "user_unverified":
			return "Sorry, I couldn't check your Slack account just now. Please try again in a minute.";
		case "busy":
			return "I'm still working through earlier messages in this thread. Please wait for those answers first.";
	}
}
