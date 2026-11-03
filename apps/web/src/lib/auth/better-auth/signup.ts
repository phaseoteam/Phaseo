/**
 * What `public.handle_auth_user_created()` (trigger `on_auth_user_created` on Supabase's auth.users) does today,
 * moved into Better Auth's `databaseHooks.user.create.after`:
 *
 * 1. Mandatory: `insert into public.users (user_id) values (new.id) on conflict (user_id) do nothing`.
 *    The trigger aborted the sign-up when this failed. Better Auth runs `create.after` hooks after the user insert
 *    has committed (queueAfterTransactionHook, better-auth 1.7.13), so a failure here can no longer undo the user;
 *    it throws so the request fails loudly, and the insert is idempotent so the next sign-in (or finalizePostLogin)
 *    repairs it. See MIGRATION-NOTES.md, "Sign-up", for the atomic alternative (a plain SQL trigger in 0002).
 * 2. Optional: a Discord message with the user id, email and created_at. The trigger read the URL from the
 *    database setting `app.settings.discord_signup_webhook_url` and posted through pg_net; here it comes from
 *    `DISCORD_AUTH_SIGNUP_WEBHOOK_URL`. Failures are logged and swallowed, as in the trigger.
 *
 * The welcome email is not here: it moved to a Resend Automation fired from finalizePostLogin (migration
 * 20260830215602), and finalizePostLogin also sends its own masked-email Discord message via
 * `DISCORD_SIGNUP_WEBHOOK_URL`. Leave `DISCORD_AUTH_SIGNUP_WEBHOOK_URL` unset to avoid a duplicate.
 */

export type SqlQuery = (text: string, values: unknown[]) => Promise<unknown>;

export type SignupUser = {
	id: string;
	email?: string | null;
	createdAt?: Date | string | null;
};

export type SignupHookDeps = {
	query: SqlQuery;
	fetchImpl?: typeof fetch;
	env?: Record<string, string | undefined>;
	log?: Pick<Console, "info" | "warn" | "error">;
};

export const PROVISION_PUBLIC_USER_SQL =
	"insert into public.users (user_id) values ($1::uuid) on conflict (user_id) do nothing";

export async function provisionPublicUser(query: SqlQuery, userId: string): Promise<void> {
	await query(PROVISION_PUBLIC_USER_SQL, [userId]);
}

export function buildSignupDiscordPayload(user: SignupUser, now: Date = new Date()) {
	const createdAt =
		user.createdAt instanceof Date
			? user.createdAt.toISOString()
			: typeof user.createdAt === "string" && user.createdAt
				? user.createdAt
				: now.toISOString();
	return {
		content: [
			"New Phaseo signup",
			`- user_id: \`${user.id}\``,
			`- email: \`${user.email || "unknown"}\``,
			`- created_at: \`${createdAt}\``,
		].join("\n"),
		allowed_mentions: { parse: [] as string[] },
	};
}

export async function notifySignupDiscord(user: SignupUser, deps: SignupHookDeps): Promise<boolean> {
	const url = (deps.env ?? process.env).DISCORD_AUTH_SIGNUP_WEBHOOK_URL?.trim();
	if (!url) return false;
	const fetchImpl = deps.fetchImpl ?? fetch;
	try {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(buildSignupDiscordPayload(user)),
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok) {
			deps.log?.warn("[signup-hook] stage=discord_webhook_request status=error", { userId: user.id, status: response.status });
			return false;
		}
		return true;
	} catch (error) {
		deps.log?.warn("[signup-hook] stage=discord_webhook_request status=error", {
			userId: user.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

/** `databaseHooks.user.create.after`. */
export function createUserCreatedHook(deps: SignupHookDeps) {
	return async (user: SignupUser): Promise<void> => {
		try {
			await provisionPublicUser(deps.query, user.id);
		} catch (error) {
			deps.log?.error("[signup-hook] stage=public_users_upsert status=error severity=mandatory", {
				userId: user.id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		await notifySignupDiscord(user, deps);
	};
}
