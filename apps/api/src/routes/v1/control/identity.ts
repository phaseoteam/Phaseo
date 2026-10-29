import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { isResponse, requireCapability, requireJsonBody, requireOAuthWorkspaceRole, rejectThirdPartyOAuthSpendingChange } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const SSO_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize(req: Request, write: boolean) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const capability = requireCapability(auth.value, write ? CAPABILITIES.SETTINGS_WRITE : CAPABILITIES.SETTINGS_READ);
	if (capability) return { response: capability };
	// Single sign-on and SCIM add members, who can create keys and spend the workspace's credits.
	const appError = write ? rejectThirdPartyOAuthSpendingChange(auth.value, "Apps that use Sign in with Phaseo can't change single sign-on or SCIM. The person can change them under Settings.") : null;
	if (appError) return { response: appError };
	const role = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, write ? ["owner", "admin"] : ["owner", "admin"]);
	if (role) return { response: role };
	return { auth: auth.value };
}

async function hasIdentityAddon(workspaceId: string) {
	const { data, error } = await getSupabaseAdmin().from("workspace_addon_subscriptions")
		.select("status,grace_until").eq("workspace_id", workspaceId).eq("addon_key", "identity").maybeSingle();
	if (error) return false;
	const status = String(data?.status ?? "").toLowerCase();
	return status === "active" || status === "trialing" || (status === "past_due" && Boolean(data?.grace_until) && Date.parse(String(data.grace_until)) > Date.now());
}

async function audit(auth: any, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId, actorUserId: auth.userId, action, targetType,
		targetId, metadata, requestId: auth.requestId,
	});
}

export function normalizeSso(body: Record<string, unknown>) {
	const mode = String(body.mode ?? body.ssoMode ?? "none").trim().toLowerCase();
	if (!["none", "saml", "custom_oidc"].includes(mode)) return { error: "sso_mode_invalid" };
	const enabled = body.enabled === true || body.ssoEnabled === true;
	if (body.enforced === true || body.ssoEnforced === true) return { error: "sso_enforcement_not_available" };
	const identifier = mode === "none" ? null : String(body.provider_identifier ?? body.ssoProviderIdentifier ?? "").trim() || null;
	const rawDomains = Array.isArray(body.domains ?? body.ssoDomains) ? (body.domains ?? body.ssoDomains) as unknown[] : [];
	const domains = Array.from(new Set(rawDomains.map((value) => String(value ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "")).filter(Boolean)));
	if (domains.some((domain) => !SSO_DOMAIN_PATTERN.test(domain))) return { error: "sso_domain_invalid" };
	if (enabled && mode === "none") return { error: "sso_mode_required" };
	if (mode === "saml" && identifier && !UUID_PATTERN.test(identifier)) return { error: "saml_provider_invalid" };
	if (mode === "custom_oidc" && identifier && !identifier.startsWith("custom:")) return { error: "oidc_provider_invalid" };
	if (enabled && !identifier) return { error: "sso_provider_required" };
	if (enabled && domains.length === 0) return { error: "sso_domain_required" };
	return { value: { sso_enabled: enabled, sso_enforced: false, sso_mode: mode, sso_provider_identifier: identifier, sso_domains: domains } };
}

function publicSso(row: Record<string, any> | null | undefined) {
	return { enabled: Boolean(row?.sso_enabled), enforced: Boolean(row?.sso_enforced), mode: String(row?.sso_mode ?? "none"), provider_identifier: row?.sso_provider_identifier ?? null, domains: Array.isArray(row?.sso_domains) ? row.sso_domains : [] };
}

function randomHex(bytes: number) {
	return [...crypto.getRandomValues(new Uint8Array(bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function generateScimToken() {
	const prefix = randomHex(6);
	return { prefix, token: `ph_scim_${prefix}_${randomHex(32)}` };
}

async function hashScimToken(token: string) {
	const pepper = String((getBindings() as Record<string, unknown>).SCIM_TOKEN_PEPPER ?? "").trim();
	if (!pepper) throw new Error("SCIM_TOKEN_PEPPER is not configured");
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
	return [...signature].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function getSso(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const { data, error } = await getSupabaseAdmin().from("workspace_settings").select("sso_enabled,sso_enforced,sso_mode,sso_provider_identifier,sso_domains").eq("workspace_id", access.auth.workspaceId).maybeSingle();
	if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	return json({ data: publicSso(data) }, 200, NO_STORE);
}

async function updateSso(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const normalized = normalizeSso(body); if ("error" in normalized) return json({ error: "bad_request", message: normalized.error }, 400, NO_STORE);
	if (normalized.value.sso_enabled && !(await hasIdentityAddon(access.auth.workspaceId))) return json({ error: "identity_addon_required" }, 402, NO_STORE);
	const payload = { workspace_id: access.auth.workspaceId, ...normalized.value, updated_at: new Date().toISOString() };
	const { error } = await getSupabaseAdmin().from("workspace_settings").upsert(payload, { onConflict: "workspace_id" });
	if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	await audit(access.auth, "identity.sso.updated", "workspace_sso", access.auth.workspaceId, { enabled: normalized.value.sso_enabled, mode: normalized.value.sso_mode, domain_count: normalized.value.sso_domains.length });
	return json({ data: publicSso(payload) }, 200, NO_STORE);
}

async function getScim(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const client = getSupabaseAdmin();
	const endpoint = await client.from("scim_endpoints").select("id,enabled,created_at,updated_at").eq("workspace_id", access.auth.workspaceId).maybeSingle();
	if (endpoint.error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	if (!endpoint.data) return json({ data: { endpoint: null, tokens: [], user_count: 0, group_count: 0, last_event: null } }, 200, NO_STORE);
	const [tokens, users, groups, lastEvent] = await Promise.all([
		client.from("scim_tokens").select("id,token_prefix,label,created_at,expires_at,last_used_at,revoked_at").eq("endpoint_id", endpoint.data.id).order("created_at", { ascending: false }),
		client.from("scim_users").select("id", { count: "exact", head: true }).eq("workspace_id", access.auth.workspaceId),
		client.from("scim_groups").select("id", { count: "exact", head: true }).eq("workspace_id", access.auth.workspaceId),
		client.from("scim_audit_events").select("action,outcome,http_status,created_at").eq("workspace_id", access.auth.workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
	]);
	if ([tokens, users, groups, lastEvent].some((result) => result.error)) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	return json({ data: { endpoint: endpoint.data, tokens: tokens.data ?? [], user_count: users.count ?? 0, group_count: groups.count ?? 0, last_event: lastEvent.data ?? null } }, 200, NO_STORE);
}

async function updateScim(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	if (typeof body.enabled !== "boolean") return json({ error: "bad_request", message: "enabled must be a boolean" }, 400, NO_STORE);
	if (body.enabled && !(await hasIdentityAddon(access.auth.workspaceId))) return json({ error: "identity_addon_required" }, 402, NO_STORE);
	const { data, error } = await getSupabaseAdmin().from("scim_endpoints").upsert({ workspace_id: access.auth.workspaceId, enabled: body.enabled, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" }).select("id,enabled,created_at,updated_at").single();
	if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	await audit(access.auth, "identity.scim.updated", "scim_endpoint", String(data.id), { enabled: body.enabled });
	return json({ data }, 200, NO_STORE);
}

async function createScimToken(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	if (!(await hasIdentityAddon(access.auth.workspaceId))) return json({ error: "identity_addon_required" }, 402, NO_STORE);
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const label = String(body.label ?? "Provisioning token").trim().slice(0, 100); if (!label) return json({ error: "bad_request", message: "label is required" }, 400, NO_STORE);
	const expiresAt = body.expires_at ? new Date(String(body.expires_at)) : null;
	if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return json({ error: "bad_request", message: "expires_at must be in the future" }, 400, NO_STORE);
	const client = getSupabaseAdmin();
	const endpoint = await client.from("scim_endpoints").upsert({ workspace_id: access.auth.workspaceId }, { onConflict: "workspace_id" }).select("id").single();
	if (endpoint.error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	try {
		const generated = generateScimToken();
		const { data, error } = await client.from("scim_tokens").insert({ endpoint_id: endpoint.data.id, token_prefix: generated.prefix, token_hash: await hashScimToken(generated.token), label, created_by: access.auth.userId ?? null, expires_at: expiresAt?.toISOString() ?? null }).select("id,token_prefix,label,created_at,expires_at").single();
		if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
		await audit(access.auth, "identity.scim_token.created", "scim_token", String(data.id), { label, expires_at: expiresAt?.toISOString() ?? null });
		return json({ data: { ...data, token: generated.token } }, 201, NO_STORE);
	} catch (error: any) { return json({ error: "server_misconfig", message: error.message }, 503, NO_STORE); }
}

async function revokeScimToken(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const tokenId = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
	const client = getSupabaseAdmin();
	const endpoint = await client.from("scim_endpoints").select("id").eq("workspace_id", access.auth.workspaceId).maybeSingle();
	if (endpoint.error || !endpoint.data) return json({ error: "not_found" }, 404, NO_STORE);
	const { data, error } = await client.from("scim_tokens").update({ revoked_at: new Date().toISOString() }).eq("endpoint_id", endpoint.data.id).eq("id", tokenId).is("revoked_at", null).select("id,label").maybeSingle();
	if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	if (!data) return json({ error: "not_found" }, 404, NO_STORE);
	await audit(access.auth, "identity.scim_token.revoked", "scim_token", String(data.id), { label: data.label ?? null });
	return json({ deleted: true }, 200, NO_STORE);
}

async function listScimAudit(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const url = new URL(req.url); const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
	let query = getSupabaseAdmin().from("scim_audit_events").select("id,request_id,correlation_id,action,resource_type,resource_id,outcome,http_status,scim_type,detail,created_at").eq("workspace_id", access.auth.workspaceId).order("created_at", { ascending: false }).limit(limit);
	const before = url.searchParams.get("before"); if (before) query = query.lt("created_at", before);
	const { data, error } = await query; if (error) return json({ error: "settings_unavailable" }, 503, NO_STORE);
	return json({ data: data ?? [] }, 200, NO_STORE);
}

export const identityRoutes = new Hono<Env>();
identityRoutes.get("/sso", withRuntime(getSso));
identityRoutes.put("/sso", withRuntime(updateSso));
identityRoutes.get("/scim", withRuntime(getScim));
identityRoutes.put("/scim", withRuntime(updateScim));
identityRoutes.post("/scim/tokens", withRuntime(createScimToken));
identityRoutes.delete("/scim/tokens/:id", withRuntime(revokeScimToken));
identityRoutes.get("/scim/audit", withRuntime(listScimAudit));
