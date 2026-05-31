import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime, getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import {
	encryptWebhookSecret,
	generateWebhookSigningSecret,
	normalizeWebhookEndpointEvents,
	toPublicWebhookEndpoint,
} from "@core/webhook-endpoints";

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

function readAuthContext(ctx: Env["Variables"]["ctx"] | undefined): { workspaceId: string | null; userId: string | null } {
	return {
		workspaceId: typeof ctx?.workspaceId === "string" ? ctx.workspaceId : null,
		userId: typeof ctx?.userId === "string" ? ctx.userId : null,
	};
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
		c.set("ctx", {
			workspaceId: auth.value.workspaceId,
			userId: auth.value.userId ?? null,
			apiKeyId: auth.value.apiKeyId,
			apiKeyRef: auth.value.apiKeyRef,
			apiKeyKid: auth.value.apiKeyKid,
			internal: auth.value.internal,
		});
		return await next();
	} finally {
		clearRuntime();
	}
});

app.get("/", async (c) => {
	const auth = readAuthContext(c.get("ctx"));
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
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const body = await c.req.json().catch(() => null);
	const parsed = createWebhookEndpointSchema.safeParse(body);
	if (!parsed.success) return validationError("Invalid webhook endpoint payload.", parsed.error.issues);
	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.insert({
			workspace_id: auth.workspaceId,
			name: parsed.data.name,
			url: parsed.data.url,
			events: normalizeWebhookEndpointEvents(parsed.data.events),
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
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
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const body = await c.req.json().catch(() => null);
	const parsed = updateWebhookEndpointSchema.safeParse(body);
	if (!parsed.success) return validationError("Invalid webhook endpoint payload.", parsed.error.issues);
	const patch: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (parsed.data.name !== undefined) patch.name = parsed.data.name;
	if (parsed.data.url !== undefined) patch.url = parsed.data.url;
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
	if (!auth.workspaceId) return validationError("workspace_id_required");
	const signingSecret = generateWebhookSigningSecret();
	const encrypted = await encryptWebhookSecret(signingSecret);
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_webhook_endpoints")
		.update({
			secret_ciphertext: encrypted.secretCiphertext,
			secret_iv: encrypted.secretIv,
			secret_hash: encrypted.secretHash,
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
