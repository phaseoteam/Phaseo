"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * OAuth App Management Server Actions
 *
 * These actions integrate with Supabase's OAuth 2.1 server to manage OAuth applications.
 * They use the Supabase Admin SDK to create, update, and delete OAuth clients.
 *
 * Architecture:
 * - Supabase OAuth server manages client credentials (opaque storage)
 * - We store rich metadata in oauth_app_metadata table
 * - All operations maintain consistency between both stores
 */

interface CreateOAuthAppInput {
	name: string;
	description?: string;
	homepage_url?: string;
	redirect_uris: string[];
	team_id: string;
	logo_url?: string;
	privacy_policy_url?: string;
	terms_of_service_url?: string;
}

interface OAuthAppResult {
	data?: any;
	error?: string;
}

/**
 * Create a new OAuth application
 *
 * This action:
 * 1. Validates user has permission for the team
 * 2. Creates OAuth client in Supabase (gets client_id + client_secret)
 * 3. Stores metadata in oauth_app_metadata table
 * 4. Returns credentials (client_secret only shown once!)
 */
export async function createOAuthAppAction(
	input: CreateOAuthAppInput
): Promise<OAuthAppResult> {
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

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", input.team_id)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to create OAuth apps for this team" };
		}

		// Validate inputs
		if (!input.name || input.name.trim().length < 3) {
			return { error: "App name must be at least 3 characters" };
		}

		if (!input.redirect_uris || input.redirect_uris.length === 0) {
			return { error: "At least one redirect URI is required" };
		}

		// Validate redirect URIs
		for (const uri of input.redirect_uris) {
			try {
				const url = new URL(uri);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					return { error: `Invalid redirect URI: ${uri}` };
				}
			} catch {
				return { error: `Invalid redirect URI format: ${uri}` };
			}
		}

		// Create OAuth client in Supabase using Admin SDK
		const adminClient = createAdminClient();
		const { data: oauthClient, error: clientError } = await (adminClient.auth.admin.oauth as any).createClient({
			name: input.name,
			redirect_uris: input.redirect_uris,
		});

		if (clientError || !oauthClient) {
			return { error: `Failed to create OAuth client: ${clientError?.message || 'Unknown error'}` };
		}

		// Store metadata in our table
		const { data: metadata, error: metadataError } = await supabase
			.from("oauth_app_metadata")
			.insert({
				client_id: oauthClient.client_id,
				team_id: input.team_id,
				name: input.name,
				description: input.description,
				homepage_url: input.homepage_url,
				logo_url: input.logo_url,
				privacy_policy_url: input.privacy_policy_url,
				terms_of_service_url: input.terms_of_service_url,
				created_by: user.id,
				status: "active",
			})
			.select()
			.single();

		if (metadataError) {
			// Rollback: delete OAuth client if metadata insert failed
			await (adminClient.auth.admin.oauth as any).deleteClient(oauthClient.client_id);
			return { error: `Failed to create OAuth app: ${metadataError.message}` };
		}

		// Return credentials (client_secret only returned once!)
		revalidatePath("/settings/oauth-apps");
		return {
			data: {
				...metadata,
				client_secret: oauthClient.client_secret,
				redirect_uris: input.redirect_uris,
			},
		};
	} catch (error: any) {
		console.error("Error creating OAuth app:", error);
		return { error: error.message || "Failed to create OAuth app" };
	}
}

/**
 * Update OAuth app metadata
 *
 * Note: This only updates metadata (name, description, etc.)
 * Redirect URIs are managed separately via updateRedirectUris
 */
export async function updateOAuthAppAction(
	clientId: string,
	updates: {
		name?: string;
		description?: string;
		homepage_url?: string;
		logo_url?: string;
		privacy_policy_url?: string;
		terms_of_service_url?: string;
	}
): Promise<OAuthAppResult> {
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

		// Fetch app to verify ownership
		const { data: app } = await supabase
			.from("oauth_app_metadata")
			.select("team_id")
			.eq("client_id", clientId)
			.single();

		if (!app) {
			return { error: "OAuth app not found" };
		}

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", app.team_id)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to update this OAuth app" };
		}

		// Update metadata
		const { data: updated, error: updateError } = await supabase
			.from("oauth_app_metadata")
			.update(updates)
			.eq("client_id", clientId)
			.select()
			.single();

		if (updateError) {
			return { error: `Failed to update OAuth app: ${updateError.message}` };
		}

		revalidatePath("/settings/oauth-apps");
		revalidatePath(`/settings/oauth-apps/${clientId}`);
		return { data: updated };
	} catch (error: any) {
		console.error("Error updating OAuth app:", error);
		return { error: error.message || "Failed to update OAuth app" };
	}
}

/**
 * Regenerate client secret
 *
 * This invalidates the old secret and generates a new one.
 * The new secret is returned only once.
 */
export async function regenerateClientSecretAction(
	clientId: string
): Promise<OAuthAppResult> {
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

		// Fetch app to verify ownership
		const { data: app } = await supabase
			.from("oauth_app_metadata")
			.select("team_id, name")
			.eq("client_id", clientId)
			.single();

		if (!app) {
			return { error: "OAuth app not found" };
		}

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", app.team_id)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to regenerate this secret" };
		}

		// Regenerate secret using Admin SDK
		const adminClient = createAdminClient();
		const { data: newSecret, error: secretError } = await (adminClient.auth.admin.oauth as any).regenerateSecret(clientId);

		if (secretError || !newSecret) {
			return { error: `Failed to regenerate secret: ${secretError?.message || 'Unknown error'}` };
		}

		revalidatePath("/settings/oauth-apps");
		revalidatePath(`/settings/oauth-apps/${clientId}`);
		return {
			data: {
				client_id: clientId,
				client_secret: newSecret.client_secret,
			},
		};
	} catch (error: any) {
		console.error("Error regenerating secret:", error);
		return { error: error.message || "Failed to regenerate secret" };
	}
}

/**
 * Delete OAuth app
 *
 * This:
 * 1. Deletes the OAuth client from Supabase (invalidates all tokens)
 * 2. Deletes metadata from oauth_app_metadata
 * 3. Cascades to delete authorizations (via foreign key)
 */
export async function deleteOAuthAppAction(
	clientId: string
): Promise<OAuthAppResult> {
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

		// Fetch app to verify ownership
		const { data: app } = await supabase
			.from("oauth_app_metadata")
			.select("team_id")
			.eq("client_id", clientId)
			.single();

		if (!app) {
			return { error: "OAuth app not found" };
		}

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", app.team_id)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to delete this OAuth app" };
		}

		// Delete OAuth client from Supabase first
		const adminClient = createAdminClient();
		const { error: clientError } = await (adminClient.auth.admin.oauth as any).deleteClient(clientId);
		if (clientError) {
			return { error: `Failed to delete OAuth client: ${clientError.message}` };
		}

		// Delete metadata (this will cascade to authorizations)
		const { error: deleteError } = await supabase
			.from("oauth_app_metadata")
			.delete()
			.eq("client_id", clientId);

		if (deleteError) {
			return { error: `Failed to delete OAuth app: ${deleteError.message}` };
		}

		revalidatePath("/settings/oauth-apps");
		return { data: { success: true } };
	} catch (error: any) {
		console.error("Error deleting OAuth app:", error);
		return { error: error.message || "Failed to delete OAuth app" };
	}
}

/**
 * List OAuth apps for a team
 */
export async function listOAuthAppsAction(
	teamId: string
): Promise<OAuthAppResult> {
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

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", teamId)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to view OAuth apps for this team" };
		}

		// Fetch apps with stats
		const { data: apps, error: appsError } = await supabase
			.from("oauth_apps_with_stats")
			.select("*")
			.eq("team_id", teamId)
			.order("created_at", { ascending: false });

		if (appsError) {
			return { error: `Failed to list OAuth apps: ${appsError.message}` };
		}

		return { data: apps };
	} catch (error: any) {
		console.error("Error listing OAuth apps:", error);
		return { error: error.message || "Failed to list OAuth apps" };
	}
}

/**
 * Update redirect URIs for an OAuth app
 */
export async function updateRedirectUrisAction(
	clientId: string,
	redirectUris: string[]
): Promise<OAuthAppResult> {
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

		// Fetch app to verify ownership
		const { data: app } = await supabase
			.from("oauth_app_metadata")
			.select("team_id")
			.eq("client_id", clientId)
			.single();

		if (!app) {
			return { error: "OAuth app not found" };
		}

		// Verify user is a member of the team
		const { data: membership } = await supabase
			.from("team_members")
			.select("team_id")
			.eq("team_id", app.team_id)
			.eq("user_id", user.id)
			.single();

		if (!membership) {
			return { error: "You don't have permission to update this OAuth app" };
		}

		// Validate redirect URIs
		if (!redirectUris || redirectUris.length === 0) {
			return { error: "At least one redirect URI is required" };
		}

		for (const uri of redirectUris) {
			try {
				const url = new URL(uri);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					return { error: `Invalid redirect URI: ${uri}` };
				}
			} catch {
				return { error: `Invalid redirect URI format: ${uri}` };
			}
		}

		// Update redirect URIs in Supabase OAuth client
		const adminClient = createAdminClient();
		const { error: updateError } = await (adminClient.auth.admin.oauth as any).updateClient(clientId, {
			redirect_uris: redirectUris,
		});

		if (updateError) {
			return { error: `Failed to update redirect URIs: ${updateError.message}` };
		}

		revalidatePath(`/settings/oauth-apps/${clientId}`);
		return { data: { redirect_uris: redirectUris } };
	} catch (error: any) {
		console.error("Error updating redirect URIs:", error);
		return { error: error.message || "Failed to update redirect URIs" };
	}
}
