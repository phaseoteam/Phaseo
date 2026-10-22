import { connectAccountMessage, forgetInstallationFacts, isLinked, linkUrl, lookupUserFacts, refusalText, type ReplyReason } from "./access";
import type { EnqueueResult } from "./coordinator";
import type { Env } from "./env";
import {
	botTokenNeedsRefresh,
	findInstallation,
	installationSecrets,
	type Installation,
	type InstallationRef,
	type SlackAppContext,
} from "./installations";
import type { AdmitResult, MeterSettings, RefuseReason } from "./meter";
import { createSlackClient, postEphemeral, type SlackClient } from "./slack-api";
import { createDb, type Db } from "./supabase";

// What the Worker does with a verified Slack event, after it has acknowledged it:
// ignore bots and edits, find the installation, dedupe the event in its thread's
// coordinator, check the person (status, guests, Slack Connect users, linked
// accounts, the meter's limits), then queue the turn. Every refusal is a polite
// ephemeral reply. Logs carry ids and outcomes only, never message text.
//
// Removing the app inside Slack (app_uninstalled, or tokens_revoked for the bot
// token) uninstalls the installation, like Uninstall in Phaseo settings.

export type Deps = {
	env: Env;
	db: Db;
	slack: (token: string) => SlackClient;
	now: () => number;
};

export function defaultDeps(env: Env): Deps {
	return { env, db: createDb(env), slack: (token) => createSlackClient(token), now: () => Date.now() };
}

type Authorization = {
	enterprise_id?: string | null;
	team_id?: string | null;
	user_id?: string | null;
	is_bot?: boolean;
	is_enterprise_install?: boolean;
};

export type SlackEvent = {
	type?: string;
	subtype?: string;
	user?: string;
	bot_id?: string;
	app_id?: string;
	bot_profile?: unknown;
	text?: string;
	ts?: string;
	thread_ts?: string;
	channel?: string;
	channel_type?: string;
	event_ts?: string;
	/** tokens_revoked: the user ids whose user (oauth) and bot tokens were revoked. */
	tokens?: { oauth?: unknown; bot?: unknown };
};

export type SlackEnvelope = {
	type?: string;
	challenge?: string;
	team_id?: string;
	enterprise_id?: string | null;
	context_team_id?: string | null;
	context_enterprise_id?: string | null;
	api_app_id?: string;
	event_id?: string;
	/** When Slack sent the event, in Unix seconds. */
	event_time?: number;
	is_enterprise_install?: boolean;
	authorizations?: Authorization[];
	event?: SlackEvent;
};

export type EventOutcome =
	| "ignored" | "ignored_bot" | "ignored_self" | "no_installation" | "duplicate" | "link_required"
	| `refused_${ReplyReason}` | "started" | "queued" | "cancelled" | "uninstalled" | "error";

/** Events that mean the app was removed in Slack, or its tokens were revoked. */
const REMOVAL_EVENTS = new Set(["app_uninstalled", "tokens_revoked"]);

/** Removal events are handled before Slack gets its answer, so a failure is retried by Slack. */
export function isRemovalEvent(envelope: SlackEnvelope): boolean {
	return REMOVAL_EVENTS.has(String(envelope.event?.type ?? ""));
}

export const CHANNEL_PATTERN = /^[CDG][A-Z0-9]{2,31}$/;
export const USER_PATTERN = /^[UW][A-Z0-9]{2,31}$/;
export const TS_PATTERN = /^[0-9]{1,12}\.[0-9]{1,8}$/;
const EVENT_ID_PATTERN = /^Ev[A-Za-z0-9]{2,64}$/;
/** Message subtypes that are a person writing. Edits, deletes, joins and bot posts are not. */
const PERSON_SUBTYPES = new Set(["file_share", "thread_broadcast", "me_message"]);

export function installationRef(envelope: SlackEnvelope): InstallationRef {
	const authorization = envelope.authorizations?.[0];
	return {
		teamId: authorization?.team_id ?? envelope.team_id ?? null,
		enterpriseId: authorization?.enterprise_id ?? envelope.enterprise_id ?? envelope.context_enterprise_id ?? null,
		isEnterpriseInstall: authorization?.is_enterprise_install ?? envelope.is_enterprise_install ?? false,
	};
}

/** Messages from bots and apps (including this one) never get an answer; this also stops bot loops. */
export function isFromBotOrApp(event: SlackEvent): boolean {
	if (event.bot_id || event.app_id || event.bot_profile) return true;
	return event.subtype !== undefined && !PERSON_SUBTYPES.has(event.subtype);
}

export function threadKey(installationId: string, channel: string, threadTs: string): string {
	return `${installationId}:${channel}:${threadTs}`;
}

export function meterSettings(installation: Installation): MeterSettings {
	return {
		id: installation.id,
		workspace_id: installation.workspace_id,
		status: installation.status,
		plan_people: installation.plan_people,
		over_plan: installation.over_plan,
		max_people: installation.max_people,
		monthly_cap_nanos: Number(installation.monthly_cap_nanos),
		answers_per_person_hour: installation.answers_per_person_hour,
		allow_guests: installation.allow_guests,
		allow_external_users: installation.allow_external_users,
	};
}

function meterFor(env: Env, installationId: string) {
	return env.METERS.get(env.METERS.idFromName(installationId));
}

export function coordinatorFor(env: Env, key: string) {
	return env.THREADS.get(env.THREADS.idFromName(key));
}

/** The installation's bot token, refreshed first when Slack rotates it. */
export async function botToken(deps: Deps, installation: Installation): Promise<string | null> {
	const secrets = await installationSecrets(deps.env, installation.secrets_ciphertext);
	if (!botTokenNeedsRefresh(secrets, deps.now())) return secrets.bot_token;
	return meterFor(deps.env, installation.id).refreshBotToken(installation.id);
}

/**
 * A refusal admins can see in the workspace audit log (slack_agent.answer_refused).
 * The meter asks for each kind at most once a month (per person for guests, Slack
 * Connect users and the hourly limit). The ones only an admin can fix are also
 * emailed (emailAdminsAboutRefusal).
 */
export async function recordRefusal(db: Db, installation: Installation, slackUserId: string, result: Extract<AdmitResult, { allowed: false }>): Promise<void> {
	try {
		await db.insert("workspace_audit_events", {
			workspace_id: installation.workspace_id,
			actor_user_id: null,
			action: "slack_agent.answer_refused",
			target_type: "slack_installation",
			target_id: installation.id,
			target_name: null,
			metadata: {
				reason: result.reason,
				slack_user_id: slackUserId,
				people: result.people,
				plan_people: installation.plan_people,
				tier_people: result.tier.people,
				max_people: installation.max_people,
				answers_per_person_hour: installation.answers_per_person_hour,
			},
		});
	} catch {
		console.error("[slack-agent] refusal not recorded in the audit log", { installationId: installation.id, reason: result.reason });
	}
}

/** Refusals that stop the agent for everyone new until an owner or admin acts. */
const EMAILED_REFUSALS: ReadonlySet<RefuseReason> = new Set(["plan_full", "max_people", "monthly_cap", "payment_due"]);

/**
 * Emails the workspace's owners and admins about a refusal only they can fix. The
 * database queues at most one email per installation, reason and month, so calling
 * it again (the next refusal, a retried event) sends nothing more.
 */
export async function emailAdminsAboutRefusal(db: Db, installation: Installation, reason: RefuseReason, people: number | null): Promise<void> {
	if (!EMAILED_REFUSALS.has(reason)) return;
	try {
		await db.rpc<number>("queue_slack_agent_refusal_email", { p_installation_id: installation.id, p_reason: reason, p_people: people });
	} catch {
		console.error("[slack-agent] refusal email not queued", { installationId: installation.id, reason });
	}
}

type ReplyTarget = { channel: string; user: string; threadTs?: string };

async function replyPrivately(slack: SlackClient, target: ReplyTarget, text: string, blocks?: unknown[]): Promise<void> {
	await postEphemeral(slack, { channel: target.channel, user: target.user, text, ...(blocks ? { blocks } : {}), ...(target.threadTs ? { thread_ts: target.threadTs } : {}) });
}

async function refuse(slack: SlackClient, target: ReplyTarget, reason: ReplyReason, details: Parameters<typeof refusalText>[1] = {}): Promise<EventOutcome> {
	const text = refusalText(reason, details);
	if (text) await replyPrivately(slack, target, text);
	return `refused_${reason}`;
}

/** Handles one verified event_callback. Never throws. */
export async function processEvent(deps: Deps, app: SlackAppContext, envelope: SlackEnvelope): Promise<EventOutcome> {
	try {
		const event = envelope.event;
		if (!event || typeof event !== "object") return "ignored";
		if (event.type === "app_mention") return await handleMessage(deps, app, envelope, event, "mention");
		if (event.type === "message" && event.channel_type === "im") return await handleMessage(deps, app, envelope, event, "dm");
		if (event.type === "agent_session_stopped") return await handleStop(deps, app, envelope, event);
		if (isRemovalEvent(envelope)) return await handleRemoval(deps, app, envelope, event);
		return "ignored";
	} catch (error) {
		console.error("[slack-agent] event failed", { eventId: envelope.event_id, type: envelope.event?.type, error: error instanceof Error ? error.message : "unknown" });
		return "error";
	}
}

async function handleMessage(deps: Deps, app: SlackAppContext, envelope: SlackEnvelope, event: SlackEvent, kind: "mention" | "dm"): Promise<EventOutcome> {
	if (isFromBotOrApp(event)) return "ignored_bot";
	const eventId = envelope.event_id ?? "";
	const { user, channel, ts } = event;
	if (!user || !USER_PATTERN.test(user) || !channel || !CHANNEL_PATTERN.test(channel) || !ts || !TS_PATTERN.test(ts) || !EVENT_ID_PATTERN.test(eventId)) return "ignored";
	if (event.thread_ts !== undefined && !TS_PATTERN.test(event.thread_ts)) return "ignored";
	const ref = installationRef(envelope);
	if (user === envelope.authorizations?.[0]?.user_id && envelope.authorizations?.[0]?.is_bot) return "ignored_self";

	const installation = await findInstallation(deps.db, app, ref);
	if (!installation) {
		console.warn("[slack-agent] no live installation", { eventId, teamId: ref.teamId, enterpriseId: ref.enterpriseId, appRowId: app.appRowId });
		return "no_installation";
	}
	if (user === installation.bot_user_id) return "ignored_self";

	const threadTs = event.thread_ts ?? ts;
	const key = threadKey(installation.id, channel, threadTs);
	const coordinator = coordinatorFor(deps.env, key);
	const now = deps.now();
	if (!(await coordinator.claimEvent(eventId, now))) return "duplicate";

	const token = await botToken(deps, installation);
	if (!token) return "error";
	const slack = deps.slack(token);
	// Ephemeral replies only show in a thread that already has replies.
	const target: ReplyTarget = { channel, user, threadTs: event.thread_ts };

	if (installation.status !== "active") {
		const reason = installation.status === "paused" ? "paused" : "payment_due";
		await emailAdminsAboutRefusal(deps.db, installation, reason, null);
		return refuse(slack, target, reason);
	}

	const facts = await lookupUserFacts(slack, installation, user, now);
	if (!facts) return refuse(slack, target, "user_unverified");
	if (facts.isBot) return "ignored_bot";

	if (installation.access_mode === "linked" && !(await isLinked(deps.db, installation.id, user))) {
		const message = connectAccountMessage(await linkUrl(deps.env, installation.id, user, now));
		await replyPrivately(slack, target, message.text, message.blocks);
		return "link_required";
	}

	const meter = meterFor(deps.env, installation.id);
	const admitted = await meter.admit({ settings: meterSettings(installation), slackUserId: user, facts, eventId, now });
	if (admitted.allowed === false) {
		console.log("[slack-agent] answer refused", { installationId: installation.id, reason: admitted.reason, people: admitted.people });
		// The email is asked for on every refusal it covers, not only the meter's monthly
		// notice: if queueing it failed once, the next refusal tries again. The database
		// queues at most one a month per reason.
		await Promise.all([
			admitted.auditForAdmins ? recordRefusal(deps.db, installation, user, admitted) : undefined,
			emailAdminsAboutRefusal(deps.db, installation, admitted.reason, admitted.people),
		]);
		return refuse(slack, target, admitted.reason, { tier: admitted.tier, limit: installation.answers_per_person_hour });
	}

	const queued: EnqueueResult = await coordinator.enqueue({
		threadKey: key,
		eventId,
		installationId: installation.id,
		teamId: ref.teamId,
		channel,
		threadTs,
		messageTs: ts,
		slackUserId: user,
		kind,
		text: typeof event.text === "string" ? event.text : "",
	}, now);
	if (queued.status === "queue_full") {
		await meter.release({ eventId });
		return refuse(slack, target, "busy");
	}
	if (queued.status === "duplicate") return "duplicate";
	console.log("[slack-agent] turn queued", { installationId: installation.id, eventId, status: queued.status, position: queued.position, newPerson: admitted.newPerson });
	return queued.status;
}

/** Slack's stop button on a processing session (agent_session_stopped). */
async function handleStop(deps: Deps, app: SlackAppContext, envelope: SlackEnvelope, event: SlackEvent): Promise<EventOutcome> {
	const eventId = envelope.event_id ?? "";
	const { channel, thread_ts: threadTs } = event;
	if (!channel || !CHANNEL_PATTERN.test(channel) || !threadTs || !TS_PATTERN.test(threadTs) || !EVENT_ID_PATTERN.test(eventId)) return "ignored";
	const installation = await findInstallation(deps.db, app, installationRef(envelope));
	if (!installation) return "no_installation";
	const coordinator = coordinatorFor(deps.env, threadKey(installation.id, channel, threadTs));
	const now = deps.now();
	if (!(await coordinator.claimEvent(eventId, now))) return "duplicate";
	const result = await coordinator.cancel(now);
	console.log("[slack-agent] thread stopped", { installationId: installation.id, turnId: result.turnId, dropped: result.dropped });
	return "cancelled";
}

/**
 * The app was removed inside Slack (app_uninstalled), or its bot token was revoked
 * (tokens_revoked lists the bot user ids; user tokens don't matter to the agent).
 * Slack sends both, in either order. One database call deletes the installation's
 * gateway key, marks it uninstalled and removes its guardrail (web-api's uninstall
 * order) and records slack_agent.uninstalled_in_slack. It is safe to repeat, and an
 * event older than a reinstall does nothing. Then the meter closes for good. Each
 * queued turn re-reads the installation before it runs, so none answers.
 */
async function handleRemoval(deps: Deps, app: SlackAppContext, envelope: SlackEnvelope, event: SlackEvent): Promise<EventOutcome> {
	const revokedBots = event.type === "tokens_revoked" ? (Array.isArray(event.tokens?.bot) ? event.tokens.bot : []) : null;
	if (revokedBots && !revokedBots.length) return "ignored";
	const installation = await findInstallation(deps.db, app, installationRef(envelope));
	if (!installation) return "no_installation";
	if (revokedBots && !revokedBots.includes(installation.bot_user_id)) return "ignored";
	const sentAt = typeof envelope.event_time === "number" && Number.isFinite(envelope.event_time) ? envelope.event_time * 1000 : deps.now();
	const removed = await deps.db.rpc<boolean>("uninstall_slack_agent_from_slack", {
		p_installation_id: installation.id,
		p_event: event.type,
		p_event_time: new Date(sentAt).toISOString(),
	});
	// Nothing to do: removed already (a concurrent delivery), or the event predates a reinstall.
	if (!removed) return "ignored";
	forgetInstallationFacts(installation.id);
	try {
		await meterFor(deps.env, installation.id).uninstalled(deps.now());
	} catch {
		// The installation is already gone, so no event reaches the meter again.
		console.error("[slack-agent] meter not closed after uninstall", { installationId: installation.id });
	}
	console.log("[slack-agent] uninstalled in Slack", { installationId: installation.id, event: event.type });
	return "uninstalled";
}
