// The Slack Web API calls the Worker makes. Slack answers HTTP 200 with
// { ok: false, error } for most failures and 429 with Retry-After when rate
// limited, so every call returns a result instead of throwing. Only Slack's error
// code is ever logged, never a response (which can hold message text or tokens).

const SLACK_API_ORIGIN = "https://slack.com/api";
const TIMEOUT_MS = 10_000;
const ROTATING_BOT_TOKEN_PATTERN = /^xoxe\.xoxb-[A-Za-z0-9-]{8,500}$/;
const REFRESH_TOKEN_PATTERN = /^xoxe-[A-Za-z0-9-]{8,500}$/;

export type SlackResult<T> = { ok: true; data: T } | { ok: false; error: string; retryAfterSeconds?: number };

export type SlackClient = {
	/**
	 * Calls a Web API method. Write methods (chat.*) take JSON; read methods such
	 * as users.info and conversations.replies only take form fields, so pass form.
	 */
	call<T = Record<string, unknown>>(method: string, args: Record<string, unknown>, options?: { form?: boolean }): Promise<SlackResult<T>>;
};

function errorCode(value: unknown): string {
	return typeof value === "string" && value ? value.slice(0, 80) : "slack_error";
}

export function createSlackClient(token: string, fetchImpl: typeof fetch = fetch): SlackClient {
	return {
		async call<T>(method: string, args: Record<string, unknown>, options?: { form?: boolean }): Promise<SlackResult<T>> {
			let response: Response;
			try {
				const form = options?.form === true;
				const body = form
					? new URLSearchParams(Object.entries(args).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => [name, String(value)])).toString()
					: JSON.stringify(args);
				response = await fetchImpl(`${SLACK_API_ORIGIN}/${method}`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
					},
					body,
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
			} catch {
				return { ok: false, error: "slack_unreachable" };
			}
			if (response.status === 429) {
				const retryAfter = Number(response.headers.get("retry-after"));
				return { ok: false, error: "ratelimited", retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60 };
			}
			const payload = await response.json().catch(() => null) as ({ ok?: unknown; error?: unknown } & T) | null;
			if (!response.ok || !payload || payload.ok !== true) {
				const error = errorCode(payload?.error);
				console.warn("[slack-agent] slack call failed", { method, status: response.status, error });
				return { ok: false, error };
			}
			return { ok: true, data: payload };
		},
	};
}

export type SlackUser = {
	id: string;
	team_id?: string;
	deleted?: boolean;
	is_bot?: boolean;
	is_app_user?: boolean;
	is_restricted?: boolean;
	is_ultra_restricted?: boolean;
	/** A user from another organisation in a Slack Connect channel. */
	is_stranger?: boolean;
	enterprise_user?: { enterprise_id?: string };
};

export async function usersInfo(client: SlackClient, userId: string): Promise<SlackResult<SlackUser>> {
	const result = await client.call<{ user?: SlackUser }>("users.info", { user: userId }, { form: true });
	if (result.ok === false) return result;
	return result.data.user && typeof result.data.user === "object" ? { ok: true, data: result.data.user } : { ok: false, error: "user_missing" };
}

export type EphemeralMessage = {
	channel: string;
	user: string;
	text: string;
	blocks?: unknown[];
	/** Only for a reply in a thread that already has replies; Slack hides it otherwise. */
	thread_ts?: string;
};

export async function postEphemeral(client: SlackClient, message: EphemeralMessage): Promise<boolean> {
	const result = await client.call("chat.postEphemeral", message);
	return result.ok;
}

export type RefreshedBotToken = { botToken: string; refreshToken: string; expiresInSeconds: number };

/** Redeems a rotating bot token's refresh token (oauth.v2.access, grant_type refresh_token). Refresh tokens are single use. */
export async function refreshBotToken(args: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	fetchImpl?: typeof fetch;
}): Promise<SlackResult<RefreshedBotToken>> {
	let payload: Record<string, unknown> | null;
	try {
		const response = await (args.fetchImpl ?? fetch)(`${SLACK_API_ORIGIN}/oauth.v2.access`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${args.clientId}:${args.clientSecret}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: args.refreshToken }).toString(),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		payload = await response.json().catch(() => null) as Record<string, unknown> | null;
	} catch {
		return { ok: false, error: "slack_unreachable" };
	}
	if (!payload || payload.ok !== true) {
		const error = errorCode(payload?.error);
		console.warn("[slack-agent] bot token refresh refused", { error });
		return { ok: false, error };
	}
	const botToken = typeof payload.access_token === "string" && ROTATING_BOT_TOKEN_PATTERN.test(payload.access_token) ? payload.access_token : null;
	const refreshToken = typeof payload.refresh_token === "string" && REFRESH_TOKEN_PATTERN.test(payload.refresh_token) ? payload.refresh_token : null;
	const expiresIn = Number(payload.expires_in);
	if (!botToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) return { ok: false, error: "slack_response_invalid" };
	return { ok: true, data: { botToken, refreshToken, expiresInSeconds: Math.floor(expiresIn) } };
}
