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
	await revokeOtherSessionsAndGrants(supabase, user.id);
	return { success: true };
}
