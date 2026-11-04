import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * After a credential change (password change or reset, new second factor), ends every other
 * sign-in of this user: their other Supabase sessions, and the CLI, desktop and app grants issued
 * by Phaseo's OAuth server. Revoking an authorization also revokes its delegated keys (database
 * trigger). The current session stays signed in. Throws if anything could not be revoked.
 */
export async function revokeOtherSessionsAndGrants(
	supabase: Pick<SupabaseClient, "auth">,
	userId: string,
): Promise<void> {
	const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });

	const admin = createAdminClient();
	const revokedAt = new Date().toISOString();
	const [tokens, authorizations] = await Promise.all([
		admin
			.from("oauth_refresh_tokens")
			.update({ revoked_at: revokedAt })
			.eq("user_id", userId)
			.is("revoked_at", null),
		admin
			.from("oauth_authorizations")
			.update({ revoked_at: revokedAt })
			.eq("user_id", userId)
			.is("revoked_at", null),
	]);

	if (signOutError || tokens.error || authorizations.error) {
		console.error("[auth] could not revoke other sessions", {
			userId,
			signOut: signOutError?.message,
			refreshTokens: tokens.error?.message,
			authorizations: authorizations.error?.message,
		});
		throw new Error(
			"Your change was saved, but we could not sign you out everywhere else. Sign out of your other devices and apps, or try again.",
		);
	}
}
