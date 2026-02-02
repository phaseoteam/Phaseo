"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * OAuth Consent Server Actions
 *
 * These actions handle the user consent flow for OAuth authorization.
 * They integrate with Supabase's OAuth 2.1 server to approve or deny
 * authorization requests.
 */

interface ApproveAuthorizationInput {
	client_id: string;
	team_id: string;
	scopes: string[];
	redirect_uri: string;
	state?: string;
	code_challenge: string;
	code_challenge_method: string;
}

interface ConsentResult {
	data?: {
		redirect_url?: string;
		authorization_id?: string;
	};
	error?: string;
}

/**
 * Approve OAuth authorization request
 *
 * This action:
 * 1. Validates user has permission for the team
 * 2. Records authorization in oauth_authorizations table
 * 3. Generates authorization code via Supabase OAuth
 * 4. Returns redirect URL with code to send user back to app
 */
export async function approveAuthorizationAction(
	input: ApproveAuthorizationInput
): Promise<ConsentResult> {
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

		// Verify user is a member of the selected team
		const { data: membership, error: membershipError } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", input.team_id)
			.eq("user_id", user.id)
			.single();

		if (membershipError || !membership) {
			return {
				error: "You don't have permission to authorize for this team",
			};
		}

		// Verify OAuth app exists and is active
		const { data: oauthApp, error: appError } = await supabase
			.from("oauth_app_metadata")
			.select("id, status")
			.eq("client_id", input.client_id)
			.eq("status", "active")
			.single();

		if (appError || !oauthApp) {
			return { error: "OAuth application not found or inactive" };
		}

		// Check if authorization already exists
		const { data: existingAuth } = await supabase
			.from("oauth_authorizations")
			.select("id, revoked_at")
			.eq("user_id", user.id)
			.eq("client_id", input.client_id)
			.eq("team_id", input.team_id)
			.maybeSingle();

		if (existingAuth) {
			// If previously revoked, update it to active
			if (existingAuth.revoked_at) {
				await supabase
					.from("oauth_authorizations")
					.update({
						scopes: input.scopes,
						revoked_at: null,
					})
					.eq("id", existingAuth.id);
			} else {
				// Already authorized, just update scopes
				await supabase
					.from("oauth_authorizations")
					.update({
						scopes: input.scopes,
					})
					.eq("id", existingAuth.id);
			}
		} else {
			// Create new authorization record
			const { error: authError } = await supabase
				.from("oauth_authorizations")
				.insert({
					user_id: user.id,
					client_id: input.client_id,
					team_id: input.team_id,
					scopes: input.scopes,
				});

			if (authError) {
				return {
					error: `Failed to create authorization: ${authError.message}`,
				};
			}
		}

		// NOTE: In production, this would call Supabase OAuth to generate authorization code
		// const { data: authCode, error: codeError } = await supabase.auth.oauth.approveAuthorization({
		//   client_id: input.client_id,
		//   redirect_uri: input.redirect_uri,
		//   scope: input.scopes.join(' '),
		//   code_challenge: input.code_challenge,
		//   code_challenge_method: input.code_challenge_method,
		// });

		// TEMPORARY: Generate mock authorization code for development
		const mockAuthCode = `auth_${Date.now()}_${Math.random().toString(36).substring(7)}`;

		// Build redirect URL with authorization code
		const redirectUrl = new URL(input.redirect_uri);
		redirectUrl.searchParams.set("code", mockAuthCode);
		if (input.state) {
			redirectUrl.searchParams.set("state", input.state);
		}

		return {
			data: {
				redirect_url: redirectUrl.toString(),
			},
		};
	} catch (error: any) {
		console.error("Error approving authorization:", error);
		return { error: error.message || "Failed to approve authorization" };
	}
}

/**
 * Deny OAuth authorization request
 *
 * This redirects the user back to the app with an error indicating
 * the authorization was denied by the user.
 */
export async function denyAuthorizationAction(input: {
	redirect_uri: string;
	state?: string;
}): Promise<ConsentResult> {
	try {
		// Build redirect URL with error
		const redirectUrl = new URL(input.redirect_uri);
		redirectUrl.searchParams.set("error", "access_denied");
		redirectUrl.searchParams.set(
			"error_description",
			"The user denied the authorization request"
		);
		if (input.state) {
			redirectUrl.searchParams.set("state", input.state);
		}

		return {
			data: {
				redirect_url: redirectUrl.toString(),
			},
		};
	} catch (error: any) {
		console.error("Error denying authorization:", error);
		return { error: error.message || "Failed to deny authorization" };
	}
}

/**
 * Revoke an OAuth authorization
 *
 * This marks the authorization as revoked, which will cause
 * subsequent API requests with tokens for this authorization to fail.
 */
export async function revokeAuthorizationAction(
	authorizationId: string
): Promise<ConsentResult> {
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
		const { error: revokeError } = await supabase
			.from("oauth_authorizations")
			.update({ revoked_at: new Date().toISOString() })
			.eq("id", authorizationId)
			.eq("user_id", user.id); // Ensure user owns this authorization

		if (revokeError) {
			return {
				error: `Failed to revoke authorization: ${revokeError.message}`,
			};
		}

		return { data: {} };
	} catch (error: any) {
		console.error("Error revoking authorization:", error);
		return { error: error.message || "Failed to revoke authorization" };
	}
}
