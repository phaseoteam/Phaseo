import type { Env } from "./env";
import { decryptSlackSecrets, encryptSlackSecrets } from "./lib/slack-secrets";
import { refreshBotToken } from "./slack-api";
import type { Db } from "./supabase";

// Which Slack app an event came through (the hosted app, or a company's own app
// from slack_apps), and the live installation it belongs to.

export const SLACK_APP_ID_PATTERN = /^A[A-Z0-9]{2,31}$/;
export const TEAM_ID_PATTERN = /^T[A-Z0-9]{2,31}$/;
export const ENTERPRISE_ID_PATTERN = /^E[A-Z0-9]{2,31}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Refresh a rotating bot token this long before Slack says it expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export type SlackAppContext = {
	/** slack_apps.id for a company's own app; null for the hosted app. */
	appRowId: string | null;
	/** Slack's app id (A...), when known. Events for any other app are refused. */
	slackAppId: string | null;
	signingSecret: string;
};

export const INSTALLATION_COLUMNS = [
	"id", "workspace_id", "slack_app_id", "team_id", "enterprise_id", "bot_user_id", "secrets_ciphertext", "key_id",
	"model", "model_choice_enabled", "allowed_models", "memory_enabled", "instructions", "access_mode", "usage_data_mode", "usage_data_channel_ids",
	"schedules_enabled", "schedule_creators", "plan_people", "over_plan", "max_people", "monthly_cap_nanos", "answers_per_person_hour", "allow_guests", "allow_external_users", "status",
	"pages_enabled", "page_expiry_days", "page_default_access", "page_link_access",
].join(",");

export type Installation = {
	id: string;
	workspace_id: string;
	slack_app_id: string | null;
	team_id: string | null;
	enterprise_id: string | null;
	bot_user_id: string;
	secrets_ciphertext: string;
	key_id: string | null;
	model: string;
	/** People may start a message with `with <model>:` to have one of allowed_models answer it (model-choice.ts). */
	model_choice_enabled: boolean;
	allowed_models: string[];
	/** The agent's notes, pins and to-dos (memory.ts). Off: none are offered or shown; saved skills still are. */
	memory_enabled: boolean;
	instructions: string | null;
	access_mode: "everyone" | "linked";
	usage_data_mode: "off" | "dm" | "dm_and_channels";
	usage_data_channel_ids: string[] | null;
	/** Recurring tasks (schedules.ts): whether people may set them up and they run. */
	schedules_enabled: boolean;
	/** Who may set up recurring tasks: anyone the agent answers, or only people who linked their Phaseo account. */
	schedule_creators: "everyone" | "linked";
	plan_people: number;
	over_plan: "refuse" | "move_up";
	max_people: number | null;
	monthly_cap_nanos: number;
	answers_per_person_hour: number;
	allow_guests: boolean;
	allow_external_users: boolean;
	status: "active" | "paused" | "payment_due" | "uninstalled";
	/** Shared pages (pages.ts): whether the agent may publish them, for how many days, and who can view them. */
	pages_enabled: boolean;
	page_expiry_days: number;
	page_default_access: "link" | "workspace";
	/** Whether a page may be open to anyone with its link. Off, every page needs a Slack sign-in. */
	page_link_access: boolean;
};

export type InstallationSecrets = {
	bot_token: string;
	gateway_key: string;
	bot_refresh_token?: string;
	bot_token_expires_at?: string;
};

/** The hosted app, or null when its signing secret is not configured. */
export function hostedApp(env: Env): SlackAppContext | null {
	const signingSecret = env.SLACK_SIGNING_SECRET?.trim();
	if (!signingSecret) return null;
	const slackAppId = env.SLACK_APP_ID?.trim();
	return {
		appRowId: null,
		slackAppId: slackAppId && SLACK_APP_ID_PATTERN.test(slackAppId) ? slackAppId : null,
		signingSecret,
	};
}

/** A company's own app by its Slack app id, with its signing secret decrypted. Null if unknown. */
export async function companyApp(env: Env, db: Db, slackAppId: string): Promise<SlackAppContext | null> {
	if (!SLACK_APP_ID_PATTERN.test(slackAppId)) return null;
	const rows = await db.select<{ id: string; slack_app_id: string; secrets_ciphertext: string }>("slack_apps", {
		select: "id,slack_app_id,secrets_ciphertext",
		slack_app_id: `eq.${slackAppId}`,
		limit: "1",
	});
	const row = rows[0];
	if (!row) return null;
	const secrets = await decryptSlackSecrets(env, row.secrets_ciphertext);
	if (!secrets.signing_secret) return null;
	return { appRowId: row.id, slackAppId: row.slack_app_id, signingSecret: secrets.signing_secret };
}

/** Where an event or interaction says the app is installed. */
export type InstallationRef = { teamId: string | null; enterpriseId: string | null; isEnterpriseInstall: boolean };

/**
 * The live installation for an app and Slack team. An org-wide (Enterprise Grid)
 * install has no team: it is found by its enterprise, also for events from one of
 * the org's workspaces.
 */
export async function findInstallation(db: Db, app: SlackAppContext, ref: InstallationRef): Promise<Installation | null> {
	const teamId = ref.teamId && TEAM_ID_PATTERN.test(ref.teamId) ? ref.teamId : null;
	const enterpriseId = ref.enterpriseId && ENTERPRISE_ID_PATTERN.test(ref.enterpriseId) ? ref.enterpriseId : null;
	if (app.appRowId !== null && !UUID_PATTERN.test(app.appRowId)) return null;
	const base = {
		select: INSTALLATION_COLUMNS,
		status: "neq.uninstalled",
		slack_app_id: app.appRowId === null ? "is.null" : `eq.${app.appRowId}`,
		limit: "1",
	};
	const byEnterprise = async () => enterpriseId
		? (await db.select<Installation>("slack_installations", { ...base, enterprise_id: `eq.${enterpriseId}`, team_id: "is.null" }))[0] ?? null
		: null;
	if (ref.isEnterpriseInstall) return byEnterprise();
	if (teamId) {
		const row = (await db.select<Installation>("slack_installations", { ...base, team_id: `eq.${teamId}` }))[0];
		if (row) return row;
	}
	return byEnterprise();
}

/** A live installation by id (turns re-read it, so a pause or uninstall applies at once). */
export async function loadInstallation(db: Db, installationId: string): Promise<Installation | null> {
	if (!UUID_PATTERN.test(installationId)) return null;
	return (await db.select<Installation>("slack_installations", {
		select: INSTALLATION_COLUMNS,
		id: `eq.${installationId}`,
		status: "neq.uninstalled",
		limit: "1",
	}))[0] ?? null;
}

/**
 * The Slack app id (A...) the installation's messages carry: the hosted app's
 * when it is configured, or the company app's. Null when it isn't known.
 */
export async function installationSlackAppId(env: Env, db: Db, installation: Pick<Installation, "slack_app_id">): Promise<string | null> {
	if (installation.slack_app_id === null) return hostedApp(env)?.slackAppId ?? null;
	if (!UUID_PATTERN.test(installation.slack_app_id)) return null;
	const row = (await db.select<{ slack_app_id: string }>("slack_apps", {
		select: "slack_app_id",
		id: `eq.${installation.slack_app_id}`,
		limit: "1",
	}))[0];
	return row && SLACK_APP_ID_PATTERN.test(row.slack_app_id) ? row.slack_app_id : null;
}

export async function installationSecrets(env: Env, ciphertext: string): Promise<InstallationSecrets> {
	const secrets = await decryptSlackSecrets(env, ciphertext);
	if (!secrets.bot_token || !secrets.gateway_key) throw new Error("slack_installation_secrets_incomplete");
	return secrets as InstallationSecrets;
}

export function botTokenNeedsRefresh(secrets: InstallationSecrets, now = Date.now()): boolean {
	if (!secrets.bot_refresh_token || !secrets.bot_token_expires_at) return false;
	const expiresAt = Date.parse(secrets.bot_token_expires_at);
	return !Number.isFinite(expiresAt) || expiresAt - now < TOKEN_REFRESH_MARGIN_MS;
}

export type AppClientCredentials = { clientId: string; clientSecret: string };

/**
 * The client credentials of the app an installation was made through: the hosted
 * app's (optional Worker secrets), or the company app's from slack_apps. Null
 * when they aren't configured.
 */
export async function appClientCredentials(env: Env, db: Db, installation: Pick<Installation, "slack_app_id">): Promise<AppClientCredentials | null> {
	let clientId: string | null;
	let clientSecret: string | null;
	if (installation.slack_app_id) {
		if (!UUID_PATTERN.test(installation.slack_app_id)) return null;
		const app = (await db.select<{ client_id: string; secrets_ciphertext: string }>("slack_apps", {
			select: "client_id,secrets_ciphertext",
			id: `eq.${installation.slack_app_id}`,
			limit: "1",
		}))[0];
		const appSecrets = app ? await decryptSlackSecrets(env, app.secrets_ciphertext) : null;
		clientId = app?.client_id ?? null;
		clientSecret = appSecrets?.client_secret ?? null;
	} else {
		clientId = env.SLACK_CLIENT_ID?.trim() || null;
		clientSecret = env.SLACK_CLIENT_SECRET?.trim() || null;
	}
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Refreshes a rotating bot token and stores it. Slack's refresh tokens are single
 * use, so this runs inside the installation's WorkspaceMeter, one refresh at a
 * time, and the write only lands if nobody stored newer secrets meanwhile.
 */
export async function refreshInstallationBotToken(env: Env, db: Db, installationId: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<string | null> {
	const row = (await db.select<{ id: string; slack_app_id: string | null; secrets_ciphertext: string }>("slack_installations", {
		select: "id,slack_app_id,secrets_ciphertext",
		id: `eq.${installationId}`,
		status: "neq.uninstalled",
		limit: "1",
	}))[0];
	if (!row) return null;
	const secrets = await installationSecrets(env, row.secrets_ciphertext);
	if (!botTokenNeedsRefresh(secrets, now)) return secrets.bot_token;

	const credentials = await appClientCredentials(env, db, row);
	if (!credentials) {
		console.error("[slack-agent] bot token needs a refresh but the app's client credentials are missing", { installationId });
		return null;
	}
	const refreshed = await refreshBotToken({
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
		refreshToken: secrets.bot_refresh_token!,
		fetchImpl,
	});
	if (refreshed.ok === false) return null;
	const next: Record<string, string> = {
		...secrets,
		bot_token: refreshed.data.botToken,
		bot_refresh_token: refreshed.data.refreshToken,
		bot_token_expires_at: new Date(now + refreshed.data.expiresInSeconds * 1000).toISOString(),
	};
	const updated = await db.update<{ id: string }>(
		"slack_installations",
		{ id: `eq.${installationId}`, secrets_ciphertext: `eq.${row.secrets_ciphertext}` },
		{ secrets_ciphertext: await encryptSlackSecrets(env, next) },
		"id",
	);
	if (!updated.length) console.warn("[slack-agent] bot token refreshed but the stored secrets changed meanwhile", { installationId });
	return refreshed.data.botToken;
}
