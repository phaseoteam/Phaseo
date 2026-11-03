"use server";

import { createClient } from "@/utils/supabase/server";
import { revokeOtherSessionsAndGrants } from "@/lib/auth/revokeOtherSessions";

/**
 * Called after a password reset: ends the user's other sessions and CLI, desktop and app grants,
 * so whoever knew the old password is signed out. The reset session itself stays signed in.
 */
export async function revokeOtherSessionsAfterPasswordResetAction() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		throw new Error("Not authenticated");
	}
	// Only a session opened from the reset email (recovery) or one that passed two-factor may do this:
	// for an MFA account, a password-only session could otherwise keep disconnecting its CLI and apps.
	const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
	if (error || !assurance) throw new Error("Could not check two-factor verification");
	const fromRecovery = (assurance.currentAuthenticationMethods ?? []).some((entry) => (typeof entry === "string" ? entry : entry.method) === "recovery");
	// Enrolment comes from the user the server just verified, not the cookie's copy, which a client can edit.
	const hasVerifiedFactor = (user.factors ?? []).some((factor) => factor.status === "verified");
	if (!fromRecovery && hasVerifiedFactor && assurance.currentLevel !== "aal2") {
		throw new Error("Complete two-factor verification first");
	}
	await revokeOtherSessionsAndGrants(supabase, user.id);
	return { success: true };
}
