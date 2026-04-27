"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * User Authorization Management Actions
 *
 * These actions allow users to manage their OAuth authorizations
 * (view and revoke access to third-party apps).
 */

interface ActionResult {
	data?: any;
	error?: string;
}

/**
 * Revoke OAuth authorization
 *
 * Marks the authorization as revoked, which will cause subsequent
 * API requests with tokens for this authorization to fail.
 */
export async function revokeAuthorizationAction(
	authorizationId: string
): Promise<ActionResult> {
	try {
		const supabase = await createClient();

		// Get current user
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return { error: "Unauthorized" };
		}

		// Revoke authorization (set revoked_at timestamp)
		// The RLS policy ensures user can only revoke their own authorizations
		const { error: revokeError } = await supabase
			.from("oauth_authorizations")
			.update({ revoked_at: new Date().toISOString() })
			.eq("id", authorizationId)
			.eq("user_id", user.id); // Extra safety check

		if (revokeError) {
			return {
				error: `Failed to revoke authorization: ${revokeError.message}`,
			};
		}

		// Revalidate the page
		revalidatePath("/settings/authorized-apps");

		return { data: { success: true } };
	} catch (error: any) {
		console.error("Error revoking authorization:", error);
		return { error: error.message || "Failed to revoke authorization" };
	}
}

/**
 * Get authorization details
 *
 * Fetches detailed information about a specific authorization.
 */
export async function getAuthorizationDetailsAction(
	authorizationId: string
): Promise<ActionResult> {
	try {
		const supabase = await createClient();

		// Get current user
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return { error: "Unauthorized" };
		}

		// Fetch authorization details
		const { data: authorization, error: authError } = await supabase
			.from("user_authorized_apps")
			.select("*")
			.eq("authorization_id", authorizationId)
			.single();

		if (authError || !authorization) {
			return { error: "Authorization not found" };
		}

		return { data: authorization };
	} catch (error: any) {
		console.error("Error fetching authorization details:", error);
		return { error: error.message || "Failed to fetch authorization details" };
	}
}
