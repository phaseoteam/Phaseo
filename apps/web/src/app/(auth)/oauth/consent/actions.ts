"use server";

import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";
import { createClient } from "@/utils/supabase/server";

/**
 * OAuth Consent Server Actions
 *
 * These actions handle the user consent flow for OAuth authorization.
 * They integrate with Supabase's OAuth 2.1 server to approve or deny
 * authorization requests.
 */

interface ApproveAuthorizationInput {
	authorization_id?: string;
	client_id?: string;
	workspace_id: string;
	workspace_ids?: string[];
	primary_workspace_id?: string;
	scopes?: string[];
	redirect_uri?: string;
	state?: string;
	code_challenge?: string;
	code_challenge_method?: string;
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
		const oauthClient = supabase.auth.oauth as any;

		// Get current user
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return { error: "Unauthorized" };
		}

		let resolvedClientId = input.client_id?.trim() || null;
		let scopes = (input.scopes ?? []).filter(
			(scope): scope is string => typeof scope === "string" && scope.trim().length > 0
		);

		if (input.authorization_id) {
			const { data: details, error: detailsError } =
				await oauthClient.getAuthorizationDetails(input.authorization_id);

			if (detailsError || !details) {
				return {
					error:
						detailsError?.message ||
						"OAuth authorization request not found or expired",
				};
			}

			if ("redirect_url" in details && details.redirect_url) {
				return {
					data: {
						redirect_url: details.redirect_url,
						authorization_id: input.authorization_id,
					},
				};
			}

			if (!resolvedClientId && typeof details.client?.id === "string") {
				resolvedClientId = details.client.id;
			}
			if (typeof details.scope === "string" && details.scope.trim().length > 0) {
				scopes = details.scope
					.split(" ")
					.map((scope: string) => scope.trim())
					.filter((scope: string) => scope.length > 0);
			}
		}

		if (!resolvedClientId) {
			return {
				error:
					"Missing client identifier for OAuth authorization. Please restart the OAuth flow.",
			};
		}

		if (scopes.length === 0) {
			scopes = ["openid", "email", "gateway:access"];
		}

		const selectedWorkspaceIds = Array.from(
			new Set(
				[
					...(Array.isArray(input.workspace_ids) ? input.workspace_ids : []),
					input.primary_workspace_id,
					input.workspace_id,
				]
					.map((workspaceId) => String(workspaceId ?? "").trim())
					.filter(Boolean),
			),
		);
		const primaryWorkspaceId =
			String(input.primary_workspace_id ?? input.workspace_id ?? "").trim() ||
			selectedWorkspaceIds[0] ||
			"";
		if (!primaryWorkspaceId || selectedWorkspaceIds.length === 0) {
			return { error: "Select at least one team to authorize" };
		}
		if (!selectedWorkspaceIds.includes(primaryWorkspaceId)) {
			return { error: "The active team must also be selected for authorization" };
		}

		const isBuiltInFirstPartyClient = resolvedClientId === "phaseo_cli";

		// Verify user is a member of every selected team
		const { data: memberships, error: membershipError } = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", user.id)
			.in("workspace_id", selectedWorkspaceIds);

		const grantedWorkspaceIds = new Set(
			(memberships ?? [])
				.map((membership: { workspace_id?: unknown }) =>
					String(membership.workspace_id ?? "").trim()
				)
				.filter(Boolean)
		);

		if (
			membershipError ||
			!selectedWorkspaceIds.every((workspaceId) => grantedWorkspaceIds.has(workspaceId))
		) {
			return {
				error: "You don't have permission to authorize for one or more selected teams",
			};
		}

		if (!isBuiltInFirstPartyClient) {
			// Verify OAuth app exists and is active
			const { data: oauthApp, error: appError } = await supabase
				.from("oauth_app_metadata")
				.select("id, status")
				.eq("client_id", resolvedClientId)
				.eq("status", "active")
				.single();

			if (appError || !oauthApp) {
				return { error: "OAuth application not found or inactive" };
			}
		}

		const resolvedRedirectUri = input.redirect_uri?.trim() || null;
		if (!resolvedRedirectUri) {
			return {
				error:
					"Missing authorization_id. Please restart the OAuth flow from the client application.",
			};
		}

		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session?.access_token) {
			return { error: "Unauthorized" };
		}

		const response = await fetch(`${apiBaseUrl()}/oauth/authorize/approve`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify({
				client_id: resolvedClientId,
				workspace_id: primaryWorkspaceId,
				primary_workspace_id: primaryWorkspaceId,
				workspace_ids: selectedWorkspaceIds,
				scopes,
				redirect_uri: resolvedRedirectUri,
				state: input.state,
				code_challenge: input.code_challenge,
				code_challenge_method: input.code_challenge_method,
			}),
			cache: "no-store",
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok || !payload?.redirect_url) {
			return {
				error: String(
					payload?.error_description ??
						payload?.message ??
						"Failed to finalize OAuth authorization"
				),
			};
		}

		return {
			data: {
				redirect_url: payload.redirect_url,
			},
		};
	} catch (error: any) {
		console.error("oauth_consent_approve_authorization_failed", {
			operation: "approveAuthorizationAction",
			error,
		});
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
	authorization_id?: string;
	redirect_uri?: string;
	state?: string;
}): Promise<ConsentResult> {
	try {
		if (input.authorization_id) {
			const supabase = await createClient();
			const oauthClient = supabase.auth.oauth as any;
			const { data: redirectData, error } = await oauthClient.denyAuthorization(
				input.authorization_id,
				{ skipBrowserRedirect: true }
			);

			if (error || !redirectData?.redirect_url) {
				return {
					error:
						error?.message || "Failed to deny authorization request",
				};
			}

			return {
				data: {
					redirect_url: redirectData.redirect_url,
					authorization_id: input.authorization_id,
				},
			};
		}

		if (!input.redirect_uri) {
			return {
				error:
					"Missing authorization_id. Please restart the OAuth flow from the client application.",
			};
		}

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
		console.error("oauth_consent_deny_authorization_failed", {
			operation: "denyAuthorizationAction",
			error,
		});
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
		console.error("oauth_consent_revoke_authorization_failed", {
			operation: "revokeAuthorizationAction",
			error,
		});
		return { error: error.message || "Failed to revoke authorization" };
	}
}
