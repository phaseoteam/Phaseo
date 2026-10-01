import { Hono } from "hono";
import { publishWorkspaceMutation } from "@/core/workspace-publication";
import {
	canonicalProviderId,
	encryptProviderCredential,
	normalizeCredentialScope,
	validateProviderCredential,
} from "@/core/provider-credentials";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	internalServerError,
	parseOffset,
	parsePathId,
	parsePositiveInt,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_KEYS_PER_ROUTING_MODE = 16;
const SAFE_COLUMNS = [
	"id", "workspace_id", "provider_id", "name", "enabled", "always_use", "routing_mode", "sort_order",
	"prefix", "suffix", "verification_status", "last_verified_at", "last_used_at",
	"created_at", "created_by", "allowed_model_slugs", "allowed_api_key_ids",
].join(",");

type ProviderCredentialRow = Record<string, unknown> & { id: string; provider_id: string; name?: string | null };

const SAFE_INPUT_ERROR = /^(key |key$|valid JSON|Google |Cloudflare |Azure |Amazon |allowed_|name |A provider can have)/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function providerCredentialInputError(error: unknown): Response | null {
	if (!(error instanceof Error) || !SAFE_INPUT_ERROR.test(error.message)) return null;
	return json({ error: "bad_request", message: error.message }, 400, { "Cache-Control": "no-store" });
}

function normalizeUuidScope(value: unknown, field: string): string[] | null {
	const values = normalizeCredentialScope(value, field);
	if (values?.some((item) => !UUID_PATTERN.test(item))) throw new Error(`${field} must contain UUIDs`);
	return values;
}

function formatCredential(row: ProviderCredentialRow) {
	return {
		...row,
		disabled: row.enabled === false,
		is_fallback: row.routing_mode === "fallback",
	};
}

function parseRoutingMode(body: Record<string, unknown>, fallback: "priority" | "fallback" = "fallback") {
	if (body.routing_mode === "priority" || body.routing_mode === "fallback") return body.routing_mode;
	if (typeof body.is_fallback === "boolean") return body.is_fallback ? "fallback" : "priority";
	if (typeof body.always_use === "boolean") return body.always_use ? "priority" : "fallback";
	return fallback;
}

async function authorize(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError };
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError };
	return { auth: auth.value };
}

async function findCredential(workspaceId: string, id: string): Promise<ProviderCredentialRow | null> {
	const { data, error } = await getSupabaseAdmin().from("byok_keys").select(SAFE_COLUMNS)
		.eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw error;
	return data as unknown as ProviderCredentialRow | null;
}

async function nextSortOrder(workspaceId: string, providerId: string, routingMode: string, excludedId?: string) {
	let query = getSupabaseAdmin().from("byok_keys").select("sort_order")
		.eq("workspace_id", workspaceId).eq("provider_id", providerId).eq("routing_mode", routingMode)
		.order("sort_order", { ascending: false }).limit(1);
	if (excludedId) query = query.neq("id", excludedId);
	const { data, error } = await query.maybeSingle();
	if (error) throw error;
	return Number(data?.sort_order ?? -1) + 1;
}

async function enforceModeLimit(workspaceId: string, providerId: string, routingMode: string, excludedId?: string) {
	let query = getSupabaseAdmin().from("byok_keys").select("id", { count: "exact", head: true })
		.eq("workspace_id", workspaceId).eq("provider_id", providerId).eq("routing_mode", routingMode);
	if (excludedId) query = query.neq("id", excludedId);
	const { count, error } = await query;
	if (error) throw error;
	if ((count ?? 0) >= MAX_KEYS_PER_ROUTING_MODE) throw new Error(`A provider can have up to ${MAX_KEYS_PER_ROUTING_MODE} ${routingMode} credentials`);
}

async function handleList(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_READ);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const url = new URL(req.url);
	const offset = parseOffset(url.searchParams.get("offset"));
	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const provider = canonicalProviderId(url.searchParams.get("provider"));
	try {
		let query = getSupabaseAdmin().from("byok_keys").select(SAFE_COLUMNS, { count: "exact" })
			.eq("workspace_id", auth.workspaceId).order("provider_id").order("routing_mode").order("sort_order")
			.range(offset, offset + limit - 1);
		if (provider) query = query.eq("provider_id", provider);
		const { data, count, error } = await query;
		if (error) throw error;
		return json({ data: (data ?? []).map((row) => formatCredential(row as unknown as ProviderCredentialRow)), total_count: count ?? 0 }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("provider_credentials.list", error); }
}

async function handleCreate(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_WRITE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const providerId = canonicalProviderId(body.provider ?? body.provider_id);
	const name = String(body.name ?? "").trim();
	if (!providerId || !name) return json({ error: "bad_request", message: "provider and name are required" }, 400, { "Cache-Control": "no-store" });
	try {
		const checked = validateProviderCredential(providerId, body.key ?? body.value);
		const routingMode = parseRoutingMode(body);
		await enforceModeLimit(auth.workspaceId, providerId, routingMode);
		const encrypted = await encryptProviderCredential({ plaintext: checked.value, workspaceId: auth.workspaceId, providerId });
		const payload = {
			workspace_id: auth.workspaceId,
			provider_id: providerId,
			name,
			enabled: typeof body.disabled === "boolean" ? !body.disabled : body.enabled !== false,
			always_use: routingMode === "priority",
			routing_mode: routingMode,
			sort_order: await nextSortOrder(auth.workspaceId, providerId, routingMode),
			...encrypted,
			verification_status: checked.strict ? "format_valid_strict" : "format_valid",
			error_message: null,
			last_verified_at: new Date().toISOString(),
			created_by: auth.userId ?? null,
			allowed_model_slugs: normalizeCredentialScope(body.allowed_models ?? body.allowed_model_slugs, "allowed_models") ?? [],
			allowed_api_key_ids: normalizeUuidScope(body.allowed_api_key_ids, "allowed_api_key_ids") ?? [],
		};
		const { data, error } = await getSupabaseAdmin().from("byok_keys").insert(payload).select(SAFE_COLUMNS).maybeSingle();
		if (error || !data) throw error ?? new Error("Provider credential was not created");
		const created = data as unknown as ProviderCredentialRow;
		await Promise.all([
			publishWorkspaceMutation(auth.workspaceId),
			recordWorkspaceAuditEvent(getSupabaseAdmin(), {
				workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "provider_credential.created",
				targetType: "provider_credential", targetId: created.id, targetName: name,
				metadata: { provider: providerId, routingMode, enabled: payload.enabled }, requestId: auth.requestId,
			}),
		]);
		return json({ data: formatCredential(created) }, 201, { "Cache-Control": "no-store" });
	} catch (error) {
		return providerCredentialInputError(error) ?? internalServerError("provider_credentials.create", error);
	}
}

async function handleGet(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_READ);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const id = parsePathId(new URL(req.url), "byok");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid provider credential id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const credential = await findCredential(auth.workspaceId, id);
		if (!credential) return json({ error: "not_found", message: "Provider credential not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatCredential(credential) }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("provider_credentials.get", error); }
}

async function handleUpdate(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_WRITE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const id = parsePathId(new URL(req.url), "byok");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid provider credential id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	try {
		const existing = await findCredential(auth.workspaceId, id);
		if (!existing) return json({ error: "not_found", message: "Provider credential not found" }, 404, { "Cache-Control": "no-store" });
		const patch: Record<string, unknown> = {};
		if (typeof body.name === "string") {
			const name = body.name.trim();
			if (!name) throw new Error("name must not be empty");
			patch.name = name;
		}
		if (typeof body.disabled === "boolean") patch.enabled = !body.disabled;
		else if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
		if (body.allowed_models !== undefined || body.allowed_model_slugs !== undefined) patch.allowed_model_slugs = normalizeCredentialScope(body.allowed_models ?? body.allowed_model_slugs, "allowed_models") ?? [];
		if (body.allowed_api_key_ids !== undefined) patch.allowed_api_key_ids = normalizeUuidScope(body.allowed_api_key_ids, "allowed_api_key_ids") ?? [];
		const currentMode = existing.routing_mode === "priority" ? "priority" : "fallback";
		const nextMode = parseRoutingMode(body, currentMode);
		if (nextMode !== currentMode) {
			await enforceModeLimit(auth.workspaceId, existing.provider_id, nextMode, id);
			patch.routing_mode = nextMode;
			patch.always_use = nextMode === "priority";
			patch.sort_order = await nextSortOrder(auth.workspaceId, existing.provider_id, nextMode, id);
		}
		if (body.key !== undefined || body.value !== undefined) {
			const checked = validateProviderCredential(existing.provider_id, body.key ?? body.value);
			Object.assign(patch, await encryptProviderCredential({ plaintext: checked.value, workspaceId: auth.workspaceId, providerId: existing.provider_id }), {
				verification_status: checked.strict ? "format_valid_strict" : "format_valid", error_message: null, last_verified_at: new Date().toISOString(),
			});
		}
		if (!Object.keys(patch).length) return json({ error: "bad_request", message: "No supported fields were provided" }, 400, { "Cache-Control": "no-store" });
		const { data, error } = await getSupabaseAdmin().from("byok_keys").update(patch)
			.eq("workspace_id", auth.workspaceId).eq("id", id).select(SAFE_COLUMNS).maybeSingle();
		if (error || !data) throw error ?? new Error("Provider credential was not updated");
		const updated = data as unknown as ProviderCredentialRow;
		await Promise.all([
			publishWorkspaceMutation(auth.workspaceId),
			recordWorkspaceAuditEvent(getSupabaseAdmin(), {
				workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "provider_credential.updated",
				targetType: "provider_credential", targetId: id, targetName: String(updated.name ?? existing.name ?? ""),
				metadata: { provider: existing.provider_id, changedFields: Object.keys(patch).filter((field) => !field.startsWith("enc_") && field !== "fingerprint_sha256") }, requestId: auth.requestId,
			}),
		]);
		return json({ data: formatCredential(updated) }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		return providerCredentialInputError(error) ?? internalServerError("provider_credentials.update", error);
	}
}

async function handleDelete(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_DELETE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const id = parsePathId(new URL(req.url), "byok");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid provider credential id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const existing = await findCredential(auth.workspaceId, id);
		if (!existing) return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
		const { error } = await getSupabaseAdmin().from("byok_keys").delete().eq("workspace_id", auth.workspaceId).eq("id", id);
		if (error) throw error;
		await Promise.all([
			publishWorkspaceMutation(auth.workspaceId),
			recordWorkspaceAuditEvent(getSupabaseAdmin(), {
				workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "provider_credential.deleted",
				targetType: "provider_credential", targetId: id, targetName: existing.name,
				metadata: { provider: existing.provider_id }, requestId: auth.requestId,
			}),
		]);
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("provider_credentials.delete", error); }
}

async function handleReorder(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PROVIDER_CREDENTIALS_WRITE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const providerId = canonicalProviderId(body.provider ?? body.provider_id);
	const routingMode = body.routing_mode;
	const keyIds = normalizeUuidScope(body.key_ids, "key_ids") ?? [];
	if (!providerId || !["priority", "fallback"].includes(String(routingMode)) || !keyIds.length) {
		return json({ error: "bad_request", message: "provider, routing_mode, and key_ids are required" }, 400, { "Cache-Control": "no-store" });
	}
	if (keyIds.length > MAX_KEYS_PER_ROUTING_MODE) return json({ error: "bad_request", message: `key_ids can contain up to ${MAX_KEYS_PER_ROUTING_MODE} items` }, 400, { "Cache-Control": "no-store" });
	try {
		const { data, error } = await getSupabaseAdmin().rpc("reorder_workspace_byok_credentials", {
			p_workspace_id: auth.workspaceId, p_provider_id: providerId, p_routing_mode: routingMode, p_key_ids: keyIds,
		});
		if (error) throw error;
		if (data !== true) return json({ error: "bad_request", message: "key_ids must contain every credential in the selected group exactly once" }, 400, { "Cache-Control": "no-store" });
		await Promise.all([
			publishWorkspaceMutation(auth.workspaceId),
			recordWorkspaceAuditEvent(getSupabaseAdmin(), {
				workspaceId: auth.workspaceId, actorUserId: auth.userId, action: "provider_credential.reordered",
				targetType: "provider_credential_group", targetId: `${providerId}:${routingMode}`,
				metadata: { provider: providerId, routingMode, count: keyIds.length }, requestId: auth.requestId,
			}),
		]);
		return json({ reordered: true }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("provider_credentials.reorder", error); }
}

export const providerCredentialsRoutes = new Hono<Env>();

providerCredentialsRoutes.get("/", withRuntime(handleList));
providerCredentialsRoutes.post("/", withRuntime(handleCreate));
providerCredentialsRoutes.post("/reorder", withRuntime(handleReorder));
providerCredentialsRoutes.get("/:id", withRuntime(handleGet));
providerCredentialsRoutes.patch("/:id", withRuntime(handleUpdate));
providerCredentialsRoutes.delete("/:id", withRuntime(handleDelete));
