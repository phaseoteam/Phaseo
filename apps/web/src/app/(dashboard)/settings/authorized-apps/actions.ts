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

async function loadAuthorizationDetails(args: {
	supabase: Awaited<ReturnType<typeof createClient>>;
	authorizationId: string;
	userId: string;
}): Promise<any | null> {
	const { supabase, authorizationId, userId } = args;

	const { data: authorization, error: authError } = await supabase
		.from("oauth_authorizations")
		.select("id, user_id, client_id, workspace_id, scopes, created_at, last_used_at")
		.eq("id", authorizationId)
		.eq("user_id", userId)
		.is("revoked_at", null)
		.maybeSingle();

	if (authError || !authorization) {
		return null;
	}

	const [appMetaResult, workspaceResult] = await Promise.all([
		supabase
			.from("oauth_app_metadata")
			.select("name, description, logo_url, homepage_url, status")
			.eq("client_id", authorization.client_id)
			.maybeSingle(),
		supabase
			.from("workspaces")
			.select("name")
			.eq("id", authorization.workspace_id)
			.maybeSingle(),
	]);

	if (appMetaResult.error || !appMetaResult.data) {
		return null;
	}
	if (appMetaResult.data.status !== "active") {
		return null;
	}

	return {
		authorization_id: authorization.id,
		user_id: authorization.user_id,
		client_id: authorization.client_id,
		workspace_id: authorization.workspace_id,
		scopes: authorization.scopes,
		authorized_at: authorization.created_at,
		last_used_at: authorization.last_used_at,
		app_name: appMetaResult.data.name,
		app_description: appMetaResult.data.description,
		app_logo_url: appMetaResult.data.logo_url,
		app_homepage_url: appMetaResult.data.homepage_url,
		team_name: workspaceResult.data?.name ?? "Unknown workspace",
	};
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

		const authorization = await loadAuthorizationDetails({
			supabase,
			authorizationId,
			userId: user.id,
		});
		if (!authorization) {
			return { error: "Authorization not found" };
		}

		return { data: authorization };
	} catch (error: any) {
		console.error("Error fetching authorization details:", error);
		return { error: error.message || "Failed to fetch authorization details" };
	}
}
