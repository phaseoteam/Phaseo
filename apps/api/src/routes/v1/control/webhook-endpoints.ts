import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime, getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import {
	encryptWebhookSecret,
	generateWebhookSigningSecret,
	normalizeWebhookEndpointEvents,
	toPublicWebhookEndpoint,
	validateWebhookEndpointUrlForDelivery,
} from "@core/webhook-endpoints";
import { getBatchApiFeatureGateName, isBatchApiAccessEnabled } from "@core/feature-flags";
import { requireCapability, requireOAuthWorkspaceRole, type ManagementRouteAuth } from "./route-helpers";

const app = new Hono<Env>();
const PAGE_SIZE = 100;

const createWebhookEndpointSchema = z.object({
	name: z.string().trim().min(1).max(120).default("Async webhooks"),
	url: z.string().trim().url(),
	events: z.array(z.string().trim().min(1)).optional(),
});

const updateWebhookEndpointSchema = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	url: z.string().trim().url().optional(),
	events: z.array(z.string().trim().min(1)).optional(),
	status: z.enum(["active", "disabled"]).optional(),
});

type WebhookRouteAuth = ManagementRouteAuth & {
	workspaceId: string | null;
	userId: string | null;
	internal: boolean;
};

function readAuthContext(ctx: Env["Variables"]["ctx"] | undefined): WebhookRouteAuth {
	return {
		workspaceId: typeof ctx?.workspaceId === "string" ? ctx.workspaceId : null,
		userId: typeof ctx?.userId === "string" ? ctx.userId : null,
		internal: ctx?.internal === true,
		authMethod: ctx?.authMethod === "oauth" ? "oauth" : "api_key",
		scopes: Array.isArray(ctx?.scopes) ? ctx.scopes.filter((scope): scope is string => typeof scope === "string") : [],
		oauthScopes: Array.isArray(ctx?.oauthScopes) ? ctx.oauthScopes.filter((scope): scope is string => typeof scope === "string") : [],
	};
}

async function requireWebhookPermission(
	auth: WebhookRouteAuth,
	capability: string,
	roles: string[],
): Promise<Response | null> {
	if (auth.internal) return null;
	const scopeError = requireCapability(auth, capability, { requireExplicitNonOAuthScope: true });
	if (scopeError) return scopeError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	return requireOAuthWorkspaceRole(auth, auth.workspaceId, roles);
}

function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function validationError(message: string, details?: unknown): Response {
	return json({
		error: {
			type: "validation_error",
			message,
			details,
		},
	}, 400);
}

async function normalizeEndpointUrlOrError(value: unknown): Promise<string | Response> {
	const validated = await validateWebhookEndpointUrlForDelivery(value);
	if (validated.ok === false) {
		return validationError("Invalid webhook endpoint URL.", {
			reason: validated.reason,
		});
	}
	return validated.url;
}

async function requireWebhookEndpointAccess(auth: {
	workspaceId: string;
	apiKeyId: string;
	apiKeyRef: string | null;
	apiKeyKid: string | null;
	userId: string | null;
	internal: boolean;
}): Promise<Response | null> {
	if (await isBatchApiAccessEnabled(auth as any)) return null;
	return json({
		error: "forbidden",
		reason: "batch_api_feature_flag_disabled",
		message: "Webhook endpoint settings are currently limited to the enabled Batch API segment.",
		feature_gate: getBatchApiFeatureGateName(),
		workspace_id: auth.workspaceId,
		status_code: 403,
		error_type: "user",
		error_origin: "gateway",
	}, 403);
}

function notFound(): Response {
	return json({
		error: {
			type: "not_found",
			message: "Webhook endpoint not found.",
		},
	}, 404);
}

app.use("*", async (c, next) => {
	configureRuntime(c.env);
	try {
		const auth = await guardManagementAuth(c.req.raw, { useKvCache: false });
		if (!auth.ok) {
			return (auth as GuardErr).response;
		}
		const readOnly = c.req.method === "GET" || c.req.method === "HEAD";
		const scopeError = requireCapability(
			auth.value,
			readOnly ? CAPABILITIES.SETTINGS_READ : CAPABILITIES.SETTINGS_WRITE,
		);
		if (scopeError) return scopeError;
		const roleError = await requireOAuthWorkspaceRole(
			auth.value,
			auth.value.workspaceId,
			readOnly ? ["owner", "admin", "member"] : ["owner", "admin"],
		);
		if (roleError) return roleError;
		const accessDenied = await requireWebhookEndpointAccess({
			workspaceId: auth.value.workspaceId,
			apiKeyId: auth.value.apiKeyId,
			apiKeyRef: auth.value.apiKeyRef,
			apiKeyKid: auth.value.apiKeyKid,
			userId: auth.value.userId ?? null,
			internal: auth.value.internal,
		});
		if (accessDenied) return accessDenied;
		c.set("ctx", {
			workspaceId: auth.value.workspaceId,
			userId: auth.value.userId ?? null,
			apiKeyId: auth.value.apiKeyId,
			apiKeyRef: auth.value.apiKeyRef,
			apiKeyKid: auth.value.apiKeyKid,
			internal: auth.value.internal,
			authMethod: auth.value.authMethod,
			scopes: auth.value.scopes ?? [],
			oauthScopes: auth.value.oauthScopes ?? [],
		});
		return await next();
	} finally {
		clearRuntime();
	}
});

app.get("/", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_READ, ["owner", "admin", "member"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const url = new URL(c.req.url);
	const limit = Math.max(1, Math.min(PAGE_SIZE, Number(url.searchParams.get("limit") ?? PAGE_SIZE) || PAGE_SIZE));
	const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
	const includeDeleted = url.searchParams.get("include_deleted") === "true";
	let query = getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.select("*")
		.eq("workspace_id", auth.workspaceId)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);
	if (!includeDeleted) query = query.neq("status", "deleted");
	const { data, error } = await query;
	if (error) throw new Error(error.message ?? "Failed to list webhook endpoints");
	return json({
		object: "list",
		data: Array.isArray(data) ? data.map((row) => toPublicWebhookEndpoint(row as Record<string, unknown>)) : [],
	});
});

app.post("/", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const body = await c.req.json().catch(() => null);
	const parsed = createWebhookEndpointSchema.safeParse(body);
	if (!parsed.success) return validationError("Invalid webhook endpoint payload.", parsed.error.issues);
	const endpointUrl = await normalizeEndpointUrlOrError(parsed.data.url);
	if (endpointUrl instanceof Response) return endpointUrl;
	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.insert({
			workspace_id: auth.workspaceId,
			name: parsed.data.name,
			url: endpointUrl,
			events: normalizeWebhookEndpointEvents(parsed.data.events),
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
			secret_key_version: encrypted.secretKeyVersion,
			created_by: auth.userId,
		})
		.select("*")
		.single();
	if (error) throw new Error(error.message ?? "Failed to create webhook endpoint");
	return json({
		...toPublicWebhookEndpoint(data as Record<string, unknown>),
		signing_secret: signingSecret,
	}, 201);
});

app.get("/:id", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_READ, ["owner", "admin", "member"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const id = c.req.param("id");
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.select("*")
		.eq("workspace_id", auth.workspaceId)
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to load webhook endpoint");
	if (!data || String((data as any).status ?? "") === "deleted") return notFound();
	return json(toPublicWebhookEndpoint(data as Record<string, unknown>));
});

app.patch("/:id", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const body = await c.req.json().catch(() => null);
	const parsed = updateWebhookEndpointSchema.safeParse(body);
	if (!parsed.success) return validationError("Invalid webhook endpoint payload.", parsed.error.issues);
	const patch: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (parsed.data.name !== undefined) patch.name = parsed.data.name;
	if (parsed.data.url !== undefined) {
		const endpointUrl = await normalizeEndpointUrlOrError(parsed.data.url);
		if (endpointUrl instanceof Response) return endpointUrl;
		patch.url = endpointUrl;
	}
	if (parsed.data.events !== undefined) patch.events = normalizeWebhookEndpointEvents(parsed.data.events);
	if (parsed.data.status !== undefined) patch.status = parsed.data.status;
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.update(patch)
		.eq("workspace_id", auth.workspaceId)
		.eq("id", c.req.param("id"))
		.neq("status", "deleted")
		.select("*")
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to update webhook endpoint");
	if (!data) return notFound();
	return json(toPublicWebhookEndpoint(data as Record<string, unknown>));
});

app.post("/:id/rotate-secret", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.update({
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
			secret_key_version: encrypted.secretKeyVersion,
			updated_at: new Date().toISOString(),
		})
		.eq("workspace_id", auth.workspaceId)
		.eq("id", c.req.param("id"))
		.neq("status", "deleted")
		.select("*")
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to rotate webhook endpoint secret");
	if (!data) return notFound();
	return json({
		...toPublicWebhookEndpoint(data as Record<string, unknown>),
		signing_secret: signingSecret,
	});
});

app.delete("/:id", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
	const permissionError = await requireWebhookPermission(auth, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if (permissionError) return permissionError;
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.update({
			status: "deleted",
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("workspace_id", auth.workspaceId)
		.eq("id", c.req.param("id"))
		.neq("status", "deleted")
		.select("id")
		.maybeSingle();
	if (error) throw new Error(error.message ?? "Failed to delete webhook endpoint");
	if (!data) return notFound();
	return json({ id: c.req.param("id"), object: "webhook_endpoint", deleted: true });
});

export default app;
