/**
 * OAuth Clients Platform Endpoint
 *
 * Provides programmatic API access to OAuth client management.
 * This allows developers to manage their OAuth apps via API (not just web UI).
 *
 * Authentication: Requires valid management API key
 * Authorization: Team-scoped (can only manage own team's OAuth apps)
 *
 * Endpoints:
 * - POST   /v1/oauth-clients      Create new OAuth app
 * - GET    /v1/oauth-clients      List team's OAuth apps
 * - GET    /v1/oauth-clients/:id  Get specific OAuth app
 * - PATCH  /v1/oauth-clients/:id  Update OAuth app
 * - DELETE /v1/oauth-clients/:id  Delete OAuth app
 * - POST   /v1/oauth-clients/:id/regenerate-secret  Regenerate secret
 */

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin, configureRuntime, clearRuntime } from "@/runtime/env";
import { z } from "zod";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES, normalizeScopeList } from "@/lib/authz/capabilities";
import { requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";
import { createOpaqueCode, hashOAuthClientSecret, isThirdPartyOAuthEnabled } from "@/lib/oauth/service";

const app = new Hono<Env>();
const PAGE_SIZE = 5000;
const DEFAULT_THIRD_PARTY_ALLOWED_SCOPES = [
	"openid",
	"profile",
	"email",
	CAPABILITIES.ME_READ,
	CAPABILITIES.WORKSPACES_READ,
	CAPABILITIES.MODELS_READ,
	CAPABILITIES.PROVIDERS_READ,
	CAPABILITIES.PRICING_READ,
] as const;

function readAuthContext(ctx: Env["Variables"]["ctx"] | undefined): {
	workspaceId: string | null;
	userId: string | null;
	authMethod: "api_key" | "oauth" | null;
	scopes: string[];
} {
	const authMethod = ctx?.authMethod;
	const scopes = ctx?.scopes;
	return {
		workspaceId: typeof ctx?.workspaceId === "string" ? ctx.workspaceId : null,
		userId: typeof ctx?.userId === "string" ? ctx.userId : null,
		authMethod: authMethod === "api_key" || authMethod === "oauth" ? authMethod : null,
		scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === "string") : [],
	};
}

app.use("*", async (c, next) => {
	configureRuntime(c.env);
	try {
		const auth = await guardManagementAuth(c.req.raw, { useKvCache: false });
		if (!auth.ok) {
			return (auth as GuardErr).response;
		}
		c.set("ctx", {
			workspaceId: auth.value.workspaceId,
			userId: auth.value.userId ?? null,
			apiKeyId: auth.value.apiKeyId,
			apiKeyRef: auth.value.apiKeyRef,
			apiKeyKid: auth.value.apiKeyKid,
			internal: auth.value.internal,
			authMethod: auth.value.authMethod ?? null,
			scopes: auth.value.scopes ?? auth.value.oauthScopes ?? [],
		});
		return await next();
	} finally {
		clearRuntime();
	}
});

// Validation schemas
const createOAuthClientSchema = z.object({
	name: z.string().min(3).max(100),
	client_type: z.enum(["public", "confidential"]).default("confidential"),
	allowed_scopes: z.array(z.string().trim().min(1)).optional(),
	description: z.string().optional(),
	homepage_url: z.string().url().optional(),
	redirect_uris: z.array(z.string().url()).min(1),
	logo_url: z.string().url().optional(),
	privacy_policy_url: z.string().url().optional(),
	terms_of_service_url: z.string().url().optional(),
});

const updateOAuthClientSchema = z.object({
	name: z.string().min(3).max(100).optional(),
	allowed_scopes: z.array(z.string().trim().min(1)).optional(),
	description: z.string().optional(),
	homepage_url: z.string().url().optional(),
	logo_url: z.string().url().optional(),
	privacy_policy_url: z.string().url().optional(),
	terms_of_service_url: z.string().url().optional(),
	redirect_uris: z.array(z.string().url()).min(1).optional(),
});

async function attachOAuthAppStats(
	supabase: ReturnType<typeof getSupabaseAdmin>,
	apps: any[],
): Promise<any[]> {
	if (!Array.isArray(apps) || apps.length === 0) return [];

	const clientIds = apps
		.map((row) => String(row?.client_id ?? "").trim())
		.filter(Boolean);
	if (!clientIds.length) return apps;

	const statsByClientId = new Map<
		string,
		{
			active_authorizations: number;
			total_authorizations: number;
			last_used_at: string | null;
			requests_last_30d: number;
		}
	>();

	for (const clientId of clientIds) {
		statsByClientId.set(clientId, {
			active_authorizations: 0,
			total_authorizations: 0,
			last_used_at: null,
			requests_last_30d: 0,
		});
	}

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("oauth_authorizations")
			.select("client_id, revoked_at, last_used_at")
			.in("client_id", clientIds)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			throw new Error(error.message ?? "Failed to load OAuth authorization stats");
		}
		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const clientId = String((row as any)?.client_id ?? "").trim();
			if (!clientId) continue;
			const stats = statsByClientId.get(clientId);
			if (!stats) continue;

			stats.total_authorizations += 1;
			if ((row as any)?.revoked_at == null) {
				stats.active_authorizations += 1;
			}

			const lastUsedAt = String((row as any)?.last_used_at ?? "").trim();
			if (!lastUsedAt) continue;
			if (!stats.last_used_at || lastUsedAt > stats.last_used_at) {
				stats.last_used_at = lastUsedAt;
			}
		}

		if (data.length < PAGE_SIZE) break;
	}

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const fromIso = thirtyDaysAgo.toISOString();
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("gateway_requests")
			.select("oauth_client_id")
			.in("oauth_client_id", clientIds)
			.gte("created_at", fromIso)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			throw new Error(error.message ?? "Failed to load OAuth usage stats");
		}
		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const clientId = String((row as any)?.oauth_client_id ?? "").trim();
			if (!clientId) continue;
			const stats = statsByClientId.get(clientId);
			if (!stats) continue;
			stats.requests_last_30d += 1;
		}

		if (data.length < PAGE_SIZE) break;
	}

	return apps.map((appRow) => {
		const clientId = String(appRow?.client_id ?? "").trim();
		const stats = statsByClientId.get(clientId);
		return {
			...appRow,
			active_authorizations: stats?.active_authorizations ?? 0,
			total_authorizations: stats?.total_authorizations ?? 0,
			last_used_at: stats?.last_used_at ?? null,
			requests_last_30d: stats?.requests_last_30d ?? 0,
		};
	});
}

async function resolveCreatorUserId(workspaceId: string): Promise<string> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("owner_user_id")
		.eq("id", workspaceId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message ?? "Failed to resolve workspace owner");
	}

	const ownerUserId = String((data as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
	if (!ownerUserId) {
		throw new Error("Workspace owner is required to create OAuth apps");
	}
	return ownerUserId;
}

function resolveAllowedScopes(
	input: unknown,
	defaultScopes: readonly string[] = DEFAULT_THIRD_PARTY_ALLOWED_SCOPES,
) {
	return normalizeScopeList(input, {
		allowIdentityScopes: true,
		defaultScopes,
	});
}

function serializeOAuthClientRecord(
	record: Record<string, unknown>,
	options: { clientSecret?: string | null } = {},
) {
	const {
		client_secret_hash: _clientSecretHash,
		...rest
	} = record;
	return {
		...rest,
		...(options.clientSecret !== undefined
			? { client_secret: options.clientSecret }
			: {}),
	};
}

function thirdPartyOAuthComingSoon() {
	return new Response(
		JSON.stringify({
			error: "third_party_oauth_disabled",
			message: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta.",
		}),
		{
			status: 403,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		},
	);
}

/**
 * POST /v1/oauth-clients
 *
 * Create a new OAuth application
 */
app.post("/", async (c) => {
	try {
		// Get authenticated context from middleware
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_WRITE);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		// Parse and validate input
		const body = await c.req.json();
		const parsed = createOAuthClientSchema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					error: "Validation error",
					details: parsed.error.issues,
				},
				400
			);
		}

		const input = parsed.data;
		const createdBy = authCtx.userId ?? await resolveCreatorUserId(authCtx.workspaceId);
		const clientType = input.client_type;
		const allowedScopes = resolveAllowedScopes(input.allowed_scopes);
		if (allowedScopes.ok === false) {
			return c.json({ error: allowedScopes.message }, 400);
		}

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

		const clientSecretHash =
			typeof oauthClient.client_secret === "string" && oauthClient.client_secret.trim().length > 0
				? await hashOAuthClientSecret(oauthClient.client_secret)
				: null;

		// Store metadata in database
		const { data: metadata, error: metadataError } = await supabase
			.from("oauth_app_metadata")
			.insert({
				client_id: oauthClient.client_id,
				workspace_id: authCtx.workspaceId,
				name: input.name,
				description: input.description,
				redirect_uris: input.redirect_uris,
				homepage_url: input.homepage_url,
				logo_url: input.logo_url,
				privacy_policy_url: input.privacy_policy_url,
				terms_of_service_url: input.terms_of_service_url,
				client_type: clientType,
				allowed_scopes: allowedScopes.value,
				client_secret_hash: clientType === "confidential" ? clientSecretHash : null,
				created_by: createdBy,
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
			serializeOAuthClientRecord(
				metadata as Record<string, unknown>,
				{
					clientSecret:
						clientType === "confidential" ? oauthClient.client_secret : null,
				},
			),
			201
		);
	} catch (error: any) {
		console.error("Error creating OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * GET /v1/oauth-clients
 *
 * List all OAuth apps for the authenticated team
 */
app.get("/", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_READ);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		// Fetch OAuth apps for workspace and attach derived stats
		const supabase = getSupabaseAdmin();
		const { data: appMetadataRows, error: appsError } = await supabase
			.from("oauth_app_metadata")
			.select("*")
			.eq("workspace_id", authCtx.workspaceId)
			.eq("status", "active")
			.order("created_at", { ascending: false });

		if (appsError) {
			console.error("Error fetching OAuth apps:", appsError);
			return c.json({ error: "Failed to fetch OAuth apps" }, 500);
		}
		const apps = await attachOAuthAppStats(supabase, appMetadataRows ?? []);

		return c.json({
			data: (apps || []).map((entry) =>
				serializeOAuthClientRecord(entry as Record<string, unknown>),
			),
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
 * GET /v1/oauth-clients/:clientId
 *
 * Get details for a specific OAuth app
 */
app.get("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_READ);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		const clientId = c.req.param("clientId");

		// Fetch OAuth app metadata and attach derived stats
		const supabase = getSupabaseAdmin();
		const { data: appMetadata, error: appError } = await supabase
			.from("oauth_app_metadata")
			.select("*")
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId)
			.eq("status", "active")
			.maybeSingle();

		if (appError || !appMetadata) {
			console.error("Error fetching OAuth app:", appError);
			return c.json({ error: "OAuth app not found" }, 404);
		}
		const withStats = await attachOAuthAppStats(supabase, [appMetadata]);
		const app = withStats[0];

		return c.json(serializeOAuthClientRecord(app as Record<string, unknown>));
	} catch (error: any) {
		console.error("Error fetching OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * PATCH /v1/oauth-clients/:clientId
 *
 * Update an OAuth app's metadata
 */
app.patch("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_WRITE);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		const clientId = c.req.param("clientId");

		// Parse and validate input
		const body = await c.req.json();
		const parsed = updateOAuthClientSchema.safeParse(body);

		if (!parsed.success) {
			return c.json(
				{
					error: "Validation error",
					details: parsed.error.issues,
				},
				400
			);
		}

		const supabase = getSupabaseAdmin();
		const updates = parsed.data;
		const oauthAdmin = (supabase.auth.admin as any).oauth;
		const allowedScopes =
			updates.allowed_scopes === undefined
				? { ok: true as const, value: undefined }
				: resolveAllowedScopes(updates.allowed_scopes, []);
		if (allowedScopes.ok === false) {
			return c.json({ error: allowedScopes.message }, 400);
		}

		const { data: existingApp, error: fetchError } = await supabase
			.from("oauth_app_metadata")
			.select("client_id")
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId)
			.maybeSingle();

		if (fetchError) {
			console.error("Error loading OAuth metadata:", fetchError);
			return c.json({ error: "Failed to update OAuth app" }, 500);
		}
		if (!existingApp) {
			return c.json({ error: "OAuth app not found" }, 404);
		}

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
		const metadataUpdates: Record<string, unknown> = {
			name: updates.name,
			description: updates.description,
			homepage_url: updates.homepage_url,
			logo_url: updates.logo_url,
			privacy_policy_url: updates.privacy_policy_url,
			terms_of_service_url: updates.terms_of_service_url,
			redirect_uris: updates.redirect_uris,
			updated_at: new Date().toISOString(),
		};
		if (allowedScopes.value !== undefined) {
			metadataUpdates.allowed_scopes = allowedScopes.value;
		}

		const { data: updated, error: metadataError } = await supabase
			.from("oauth_app_metadata")
			.update(metadataUpdates)
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId)
			.select()
			.single();

		if (metadataError || !updated) {
			console.error("Error updating OAuth metadata:", metadataError);
			return c.json({ error: "Failed to update OAuth app" }, 500);
		}

		return c.json(serializeOAuthClientRecord(updated as Record<string, unknown>));
	} catch (error: any) {
		console.error("Error updating OAuth client:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

/**
 * DELETE /v1/oauth-clients/:clientId
 *
 * Delete an OAuth app (revokes all authorizations)
 */
app.delete("/:clientId", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_DELETE);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		const clientId = c.req.param("clientId");

		const supabase = getSupabaseAdmin();

		// Verify ownership before deleting
		const { data: app, error: fetchError } = await supabase
			.from("oauth_app_metadata")
			.select("client_id")
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId)
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
			.eq("workspace_id", authCtx.workspaceId);

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
 * POST /v1/oauth-clients/:clientId/regenerate-secret
 *
 * Regenerate the client secret (invalidates old one)
 */
app.post("/:clientId/regenerate-secret", async (c) => {
	try {
		const authCtx = readAuthContext(c.get("ctx"));
		if (!authCtx.workspaceId) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const scopeError = requireCapability(authCtx, CAPABILITIES.OAUTH_CLIENTS_WRITE);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(authCtx, authCtx.workspaceId, ["owner", "admin"]);
		if (roleError) return roleError;
		if (!isThirdPartyOAuthEnabled()) return thirdPartyOAuthComingSoon();

		const clientId = c.req.param("clientId");

		const supabase = getSupabaseAdmin();

		// Verify ownership
		const { data: app, error: fetchError } = await supabase
			.from("oauth_app_metadata")
			.select("client_id, client_type")
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId)
			.single();

		if (fetchError || !app) {
			return c.json({ error: "OAuth app not found" }, 404);
		}
		if (String((app as any).client_type ?? "confidential") !== "confidential") {
			return c.json({ error: "Public OAuth apps do not use client secrets" }, 400);
		}

		const nextSecret = createOpaqueCode();
		const nextSecretHash = await hashOAuthClientSecret(nextSecret);
		const { error: secretError } = await supabase
			.from("oauth_app_metadata")
			.update({
				client_secret_hash: nextSecretHash,
				updated_at: new Date().toISOString(),
			})
			.eq("client_id", clientId)
			.eq("workspace_id", authCtx.workspaceId);

		if (secretError) {
			console.error("Error regenerating OAuth secret:", secretError);
			return c.json({ error: "Failed to regenerate secret" }, 500);
		}

		return c.json({
			client_id: clientId,
			client_secret: nextSecret, // Only returned once!
			message: "Client secret regenerated successfully",
		});
	} catch (error: any) {
		console.error("Error regenerating secret:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

export default app;

