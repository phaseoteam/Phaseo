/**
 * OAuth Clients Control Endpoint
 *
 * Provides programmatic API access to OAuth client management.
 * This allows developers to manage their OAuth apps via API (not just web UI).
 *
 * Authentication: Requires valid API key with appropriate permissions
 * Authorization: Team-scoped (can only manage own team's OAuth apps)
 *
 * Endpoints:
 * - POST   /v1/control/oauth-clients      Create new OAuth app
 * - GET    /v1/control/oauth-clients      List team's OAuth apps
 * - GET    /v1/control/oauth-clients/:id  Get specific OAuth app
 * - PATCH  /v1/control/oauth-clients/:id  Update OAuth app
 * - DELETE /v1/control/oauth-clients/:id  Delete OAuth app
 * - POST   /v1/control/oauth-clients/:id/regenerate-secret  Regenerate secret
 */

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { z } from "zod";

const app = new Hono<Env>();

function readAuthContext(ctx: Env["Variables"]["ctx"] | undefined): { teamId: string | null; userId: string | null } {
	return {
		teamId: typeof ctx?.teamId === "string" ? ctx.teamId : null,
		userId: typeof ctx?.userId === "string" ? ctx.userId : null,
	};
}

// Validation schemas
const createOAuthClientSchema = z.object({
	name: z.string().min(3).max(100),
	description: z.string().optional(),
	homepage_url: z.string().url().optional(),
	redirect_uris: z.array(z.string().url()).min(1),
	logo_url: z.string().url().optional(),
	privacy_policy_url: z.string().url().optional(),
	terms_of_service_url: z.string().url().optional(),
});

const updateOAuthClientSchema = z.object({
	name: z.string().min(3).max(100).optional(),
	description: z.string().optional(),
	homepage_url: z.string().url().optional(),
	logo_url: z.string().url().optional(),
	privacy_policy_url: z.string().url().optional(),
	terms_of_service_url: z.string().url().optional(),
	redirect_uris: z.array(z.string().url()).optional(),
});

/**
 * POST /v1/control/oauth-clients
 *
 * Create a new OAuth application
 */
app.post("/", async (c) => {
	try {
		// Get authenticated context from middleware
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Parse and validate input
		const body = await c.req.json();
		const parsed = createOAuthClientSchema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					error: "Validation error",
					details: parsed.error.errors,
				},
				400
			);
		}

		const input = parsed.data;

		// Create OAuth client using Supabase Admin SDK
		const supabase = getSupabaseAdmin();
		const oauthAdmin = (supabase.auth.admin as any).oauth;
		const { data: oauthClient, error: clientError } = await oauthAdmin.createClient({
			name: input.name,
			redirect_uris: input.redirect_uris,
		});

		if (clientError || !oauthClient) {
			console.error("Error creating OAuth client:", clientError);
			return c.json(
				{ error: `Failed to create OAuth client: ${clientError?.message || 'Unknown error'}` },
				500
			);
		}

		// Store metadata in database
		const { data: metadata, error: metadataError } = await supabase
			.from("oauth_app_metadata")
			.insert({
				client_id: oauthClient.client_id,
				team_id: authCtx.teamId,
				name: input.name,
				description: input.description,
				homepage_url: input.homepage_url,
				logo_url: input.logo_url,
				privacy_policy_url: input.privacy_policy_url,
				terms_of_service_url: input.terms_of_service_url,
				created_by: authCtx.userId,
				status: "active",
			})
			.select()
			.single();

		if (metadataError) {
			// Rollback: delete OAuth client if metadata insert failed
			await oauthAdmin.deleteClient(oauthClient.client_id);
			console.error("Error storing OAuth metadata:", metadataError);
			return c.json(
				{ error: `Failed to create OAuth app: ${metadataError.message}` },
				500
			);
		}

		return c.json(
			{
				...metadata,
				client_secret: oauthClient.client_secret, // Only returned on creation!
				redirect_uris: input.redirect_uris,
			},
			201
		);
	} catch (error: any) {
		console.error("Error creating OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * GET /v1/control/oauth-clients
 *
 * List all OAuth apps for the authenticated team
 */
app.get("/", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Fetch OAuth apps for team from database view
		const supabase = getSupabaseAdmin();
		const { data: apps, error: appsError } = await supabase
			.from("oauth_apps_with_stats")
			.select("*")
			.eq("team_id", authCtx.teamId)
			.order("created_at", { ascending: false });

		if (appsError) {
			console.error("Error fetching OAuth apps:", appsError);
			return c.json({ error: "Failed to fetch OAuth apps" }, 500);
		}

		return c.json({
			data: apps || [],
			pagination: {
				total: apps?.length || 0,
				page: 1,
				per_page: 100,
			},
		});
	} catch (error: any) {
		console.error("Error listing OAuth clients:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * GET /v1/control/oauth-clients/:clientId
 *
 * Get details for a specific OAuth app
 */
app.get("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const clientId = c.req.param("clientId");

		// Fetch OAuth app with stats
		const supabase = getSupabaseAdmin();
		const { data: app, error: appError } = await supabase
			.from("oauth_apps_with_stats")
			.select("*")
			.eq("client_id", clientId)
			.eq("team_id", authCtx.teamId)
			.single();

		if (appError || !app) {
			console.error("Error fetching OAuth app:", appError);
			return c.json({ error: "OAuth app not found" }, 404);
		}

		return c.json(app);
	} catch (error: any) {
		console.error("Error fetching OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * PATCH /v1/control/oauth-clients/:clientId
 *
 * Update an OAuth app's metadata
 */
app.patch("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const clientId = c.req.param("clientId");

		// Parse and validate input
		const body = await c.req.json();
		const parsed = updateOAuthClientSchema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					error: "Validation error",
					details: parsed.error.errors,
				},
				400
			);
		}

		const supabase = getSupabaseAdmin();
		const updates = parsed.data;
		const oauthAdmin = (supabase.auth.admin as any).oauth;

		// If updating redirect URIs, update in Supabase OAuth client
		if (updates.redirect_uris) {
			const { error: updateError } = await oauthAdmin.updateClient(clientId, {
				redirect_uris: updates.redirect_uris,
			});

			if (updateError) {
				console.error("Error updating OAuth client redirect URIs:", updateError);
				return c.json({ error: "Failed to update redirect URIs" }, 500);
			}
		}

		// Update metadata in database
		const { data: updated, error: metadataError } = await supabase
			.from("oauth_app_metadata")
			.update({
				name: updates.name,
				description: updates.description,
				homepage_url: updates.homepage_url,
				logo_url: updates.logo_url,
				privacy_policy_url: updates.privacy_policy_url,
				terms_of_service_url: updates.terms_of_service_url,
				updated_at: new Date().toISOString(),
			})
			.eq("client_id", clientId)
			.eq("team_id", authCtx.teamId)
			.select()
			.single();

		if (metadataError || !updated) {
			console.error("Error updating OAuth metadata:", metadataError);
			return c.json({ error: "Failed to update OAuth app" }, 500);
		}

		return c.json({
			...updated,
			redirect_uris: updates.redirect_uris,
		});
	} catch (error: any) {
		console.error("Error updating OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * DELETE /v1/control/oauth-clients/:clientId
 *
 * Delete an OAuth app (revokes all authorizations)
 */
app.delete("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const clientId = c.req.param("clientId");

		const supabase = getSupabaseAdmin();

		// Verify ownership before deleting
		const { data: app, error: fetchError } = await supabase
			.from("oauth_app_metadata")
			.select("client_id")
			.eq("client_id", clientId)
			.eq("team_id", authCtx.teamId)
			.single();

		if (fetchError || !app) {
			return c.json({ error: "OAuth app not found" }, 404);
		}

		// Delete from Supabase OAuth first
		const oauthAdmin = (supabase.auth.admin as any).oauth;
		const { error: clientError } = await oauthAdmin.deleteClient(clientId);
		if (clientError) {
			console.error("Error deleting OAuth client:", clientError);
			return c.json({ error: "Failed to delete OAuth client" }, 500);
		}

		// Delete metadata (this will cascade to authorizations via foreign key)
		const { error: deleteError } = await supabase
			.from("oauth_app_metadata")
			.delete()
			.eq("client_id", clientId)
			.eq("team_id", authCtx.teamId);

		if (deleteError) {
			console.error("Error deleting OAuth metadata:", deleteError);
			return c.json({ error: "Failed to delete OAuth app metadata" }, 500);
		}

		return c.json({
			message: "OAuth app deleted successfully",
			client_id: clientId,
		});
	} catch (error: any) {
		console.error("Error deleting OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * POST /v1/control/oauth-clients/:clientId/regenerate-secret
 *
 * Regenerate the client secret (invalidates old one)
 */
app.post("/:clientId/regenerate-secret", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.teamId) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const clientId = c.req.param("clientId");

		const supabase = getSupabaseAdmin();

		// Verify ownership
		const { data: app, error: fetchError } = await supabase
			.from("oauth_app_metadata")
			.select("client_id")
			.eq("client_id", clientId)
			.eq("team_id", authCtx.teamId)
			.single();

		if (fetchError || !app) {
			return c.json({ error: "OAuth app not found" }, 404);
		}

		// Regenerate secret via Supabase Admin SDK
		const oauthAdmin = (supabase.auth.admin as any).oauth;
		const { data: newSecret, error: secretError } = await oauthAdmin.regenerateSecret(clientId);

		if (secretError || !newSecret) {
			console.error("Error regenerating OAuth secret:", secretError);
			return c.json({ error: "Failed to regenerate secret" }, 500);
		}

		return c.json({
			client_id: clientId,
			client_secret: newSecret.client_secret, // Only returned once!
			message: "Client secret regenerated successfully",
		});
	} catch (error: any) {
		console.error("Error regenerating secret:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

export default app;
