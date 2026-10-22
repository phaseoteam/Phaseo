// The few Slack Web API calls the settings API makes: the OAuth v2 code exchange
// and apps.uninstall. Slack answers HTTP 200 with { ok: false, error } for most
// failures, so every response is validated before anything is stored, and raw
// Slack errors and tokens are never passed back to the browser.

/**
 * The Slack agent's bot scopes. The app manifest uses the same list. Only what
 * the agent uses today: a scope for a new feature is added with that feature
 * (installs keep the scopes they were granted until they are reinstalled).
 */
export const SLACK_AGENT_BOT_SCOPES = [
	"app_mentions:read",
	"assistant:write",
	"chat:write",
	"im:history",
	"channels:history",
	"groups:history",
	"users:read",
] as const;

export const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_API_ORIGIN = "https://slack.com/api";
const SLACK_TIMEOUT_MS = 10_000;

const BOT_TOKEN_PATTERN = /^(?:xoxe\.)?xoxb-[A-Za-z0-9-]{8,500}$/;
const REFRESH_TOKEN_PATTERN = /^xoxe-[A-Za-z0-9-]{8,500}$/;
const BOT_USER_PATTERN = /^[UWB][A-Z0-9]{2,31}$/;
const TEAM_PATTERN = /^T[A-Z0-9]{2,31}$/;
const ENTERPRISE_PATTERN = /^E[A-Z0-9]{2,31}$/;
const APP_PATTERN = /^A[A-Z0-9]{2,31}$/;

export type SlackAppCredentials = {
	clientId: string;
	clientSecret: string;
	/** The Slack app id (A...) when it is a workspace's own app; null for the hosted app. */
	slackAppId: string | null;
};

export type SlackInstallGrant = {
	botToken: string;
	botUserId: string;
	teamId: string | null;
	teamName: string | null;
	enterpriseId: string | null;
	appId: string | null;
	/** Only when the app has token rotation turned on. */
	refreshToken: string | null;
	expiresInSeconds: number | null;
};

export function slackAuthorizeUrl(args: { clientId: string; redirectUri: string; state: string }): string {
	const url = new URL(SLACK_AUTHORIZE_URL);
	url.searchParams.set("client_id", args.clientId);
	url.searchParams.set("scope", SLACK_AGENT_BOT_SCOPES.join(","));
	url.searchParams.set("redirect_uri", args.redirectUri);
	url.searchParams.set("state", args.state);
	return url.toString();
}

function text(value: unknown, pattern: RegExp): string | null {
	return typeof value === "string" && pattern.test(value) ? value : null;
}

function displayName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.trim().slice(0, 200);
	return name || null;
}

/** A successful oauth.v2.access bot install, or null if anything required is missing or malformed. */
export function parseSlackInstallGrant(payload: unknown): SlackInstallGrant | null {
	if (!payload || typeof payload !== "object") return null;
	const body = payload as Record<string, any>;
	if (body.ok !== true || body.token_type !== "bot") return null;
	const botToken = text(body.access_token, BOT_TOKEN_PATTERN);
	const botUserId = text(body.bot_user_id, BOT_USER_PATTERN);
	const team = body.team && typeof body.team === "object" ? body.team : null;
	const enterprise = body.enterprise && typeof body.enterprise === "object" ? body.enterprise : null;
	const teamId = team ? text(team.id, TEAM_PATTERN) : null;
	const enterpriseId = enterprise ? text(enterprise.id, ENTERPRISE_PATTERN) : null;
	if (!botToken || !botUserId) return null;
	if (team && team.id != null && !teamId) return null;
	if (enterprise && enterprise.id != null && !enterpriseId) return null;
	if (!teamId && !enterpriseId) return null;
	const appId = body.app_id == null ? null : text(body.app_id, APP_PATTERN);
	if (body.app_id != null && !appId) return null;
	const refreshToken = body.refresh_token == null ? null : text(body.refresh_token, REFRESH_TOKEN_PATTERN);
	if (body.refresh_token != null && !refreshToken) return null;
	const expiresIn = Number(body.expires_in);
	return {
		botToken,
		botUserId,
		teamId,
		teamName: teamId ? displayName(team?.name) : displayName(enterprise?.name),
		enterpriseId,
		appId,
		refreshToken,
		expiresInSeconds: refreshToken && Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(expiresIn) : null,
	};
}

/** Exchanges an OAuth code for the bot token (client credentials in HTTP Basic auth, as Slack recommends). */
export async function exchangeSlackCode(args: {
	credentials: SlackAppCredentials;
	code: string;
	redirectUri: string;
}): Promise<{ ok: true; grant: SlackInstallGrant } | { ok: false; error: "slack_exchange_failed" | "slack_response_invalid" }> {
	let payload: unknown;
	try {
		const response = await fetch(`${SLACK_API_ORIGIN}/oauth.v2.access`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${args.credentials.clientId}:${args.credentials.clientSecret}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ code: args.code, redirect_uri: args.redirectUri }).toString(),
			signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
		});
		if (!response.ok) return { ok: false, error: "slack_exchange_failed" };
		payload = await response.json();
	} catch {
		return { ok: false, error: "slack_exchange_failed" };
	}
	if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
		// Log Slack's error code only (never the response, which may hold a token).
		const code = typeof (payload as { error?: unknown } | null)?.error === "string" ? String((payload as { error: string }).error).slice(0, 80) : null;
		console.warn("[slack-agent] oauth.v2.access refused", { error: code });
		return { ok: false, error: "slack_exchange_failed" };
	}
	const grant = parseSlackInstallGrant(payload);
	return grant ? { ok: true, grant } : { ok: false, error: "slack_response_invalid" };
}

/** Best effort: removes the app from the Slack workspace, which also revokes its tokens. */
export async function uninstallSlackApp(args: { credentials: SlackAppCredentials; botToken: string }): Promise<boolean> {
	try {
		const response = await fetch(`${SLACK_API_ORIGIN}/apps.uninstall`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${args.botToken}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ client_id: args.credentials.clientId, client_secret: args.credentials.clientSecret }).toString(),
			signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
		});
		const payload = await response.json().catch(() => null) as { ok?: unknown } | null;
		return response.ok && payload?.ok === true;
	} catch {
		return false;
	}
}
