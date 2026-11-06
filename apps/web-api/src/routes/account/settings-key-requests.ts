import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireUser, type AuthenticatedUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { encryptKeyRequestSecret } from "@/lib/keyRequestSecret";
import { requireAccountWorkspace } from "./context";
import { createWorkspaceApiKey } from "./settings-keys";

// API key requests from the CLI's coding-agent setup (POST /v1/key-requests on the gateway). The person
// reviews one on the dashboard page /settings/keys/requests/{id} and approves or denies it here.
//
// Approval needs the person's own dashboard session: a token issued to any OAuth client is refused,
// Phaseo's CLI and desktop app included (their client IDs are public, so anyone can start their sign-in),
// and requireUser applies the same MFA rule as every other account route (an enrolled factor needs an
// aal2 session). Only the person who made the request may approve it, as an owner or admin of its
// workspace, the role that creates keys in the dashboard. The key is created with
// createWorkspaceApiKey, the dashboard's own key-creation code, using the name, limits and lifetime
// stored with the request: exactly what the page showed. Its secret is never returned here; it is held
// encrypted on the request until the CLI collects it with the PKCE verifier.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASEO_APP_CLIENT_IDS = new Set(["phaseo_cli", "aistats_cli", "phaseo_desktop"]);
const SECRET_PICKUP_SECONDS = 600;
const DASHBOARD_SESSION_REQUIRED = "Approve key requests in the Phaseo dashboard while signed in there. A CLI, desktop app or other app sign-in can't approve them.";

type KeyRequestRow = {
	id: string;
	workspace_id: string;
	requested_by: string;
	requested_via: string;
	oauth_client_id: string | null;
	client_name: string;
	agent: string | null;
	key_name: string;
	daily_cost_nanos: number | string;
	monthly_cost_nanos: number | string;
	key_lifetime_days: number;
	status: string;
	key_id: string | null;
	decided_at: string | null;
	expires_at: string;
	created_at: string;
};

type ClaimRow = {
	status: string;
	changed: boolean;
	workspace_id: string;
	key_name: string;
	daily_cost_nanos: number | string;
	monthly_cost_nanos: number | string;
	key_lifetime_days: number;
};

function tokenClaims(request: Request): Record<string, unknown> | null {
	const header = request.headers.get("authorization")?.trim() ?? "";
	if (!header.startsWith("Bearer ")) return null;
	const payload = header.slice(7).trim().split(".")[1];
	if (!payload) return null;
	try {
		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
		const claims = JSON.parse(atob(base64)) as unknown;
		return claims && typeof claims === "object" ? claims as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

/** Whether the bearer token was issued to an OAuth client at all; the person's own session has no client_id. */
export function isOAuthClientToken(request: Request): boolean {
	const clientId = tokenClaims(request)?.client_id;
	return clientId !== undefined && clientId !== null;
}

function requestId(c: { req: { header(name: string): string | undefined } }) {
	return c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null;
}

async function dashboardUser(c: any): Promise<{ user: AuthenticatedUser } | { response: Response }> {
	if (isOAuthClientToken(c.req.raw)) {
		return { response: c.json({ error: "forbidden", reason: "dashboard_session_required", message: DASHBOARD_SESSION_REQUIRED }, 403, PRIVATE_NO_STORE_HEADERS) };
	}
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return { response: c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS) };
	return { user };
}

async function loadRequest(env: Env, id: string): Promise<KeyRequestRow | null> {
	const result = await getDataClient(env).rpc("get_api_key_request", { p_request_id: id });
	if (result.error) throw result.error;
	const rows = (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as KeyRequestRow[];
	return rows[0] ?? null;
}

function nanosToUsd(value: unknown): number | null {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) && nanos > 0 ? nanos / 1_000_000_000 : null;
}

function isManager(role: string): boolean {
	return ["owner", "admin"].includes(role.toLowerCase());
}

function view(row: KeyRequestRow, workspaceName: string, canApprove: boolean) {
	return {
		id: row.id,
		status: row.status,
		workspaceId: row.workspace_id,
		workspaceName,
		keyName: row.key_name,
		agent: row.agent,
		clientName: row.client_name,
		phaseoApp: row.requested_via === "oauth" && PHASEO_APP_CLIENT_IDS.has(String(row.oauth_client_id ?? "")),
		requestedVia: row.requested_via,
		dailyCostNanos: Number(row.daily_cost_nanos ?? 0),
		monthlyCostNanos: Number(row.monthly_cost_nanos ?? 0),
		keyLifetimeDays: row.key_lifetime_days,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		decidedAt: row.decided_at,
		keyId: row.key_id,
		canApprove: canApprove && row.status === "pending",
	};
}

export type KeyRequestView = ReturnType<typeof view>;

/** What the approval page showed; approval is refused if the stored request says anything else. */
function matchesShown(row: { key_name: string; daily_cost_nanos: number | string; monthly_cost_nanos: number | string; key_lifetime_days: number }, shown: unknown): boolean {
	if (!shown || typeof shown !== "object") return false;
	const value = shown as Record<string, unknown>;
	return value.keyName === row.key_name
		&& Number(value.dailyCostNanos) === Number(row.daily_cost_nanos ?? 0)
		&& Number(value.monthlyCostNanos) === Number(row.monthly_cost_nanos ?? 0)
		&& Number(value.keyLifetimeDays) === Number(row.key_lifetime_days);
}

async function revokeUnreturnedKey(env: Env, keyId: string) {
	// Nobody has seen this key's secret, so it has never been used or cached by the gateway.
	await getDataClient(env).from("keys").update({ status: "deleted", soft_blocked: true, expires_at: new Date().toISOString(), hash: `deleted:${keyId}` }).eq("id", keyId);
}

export const accountSettingsKeyRequestsRouter = new Hono<{ Bindings: Env }>();

accountSettingsKeyRequestsRouter.get("/keys/requests/:requestId", async (c) => {
	const auth = await dashboardUser(c); if ("response" in auth) return auth.response;
	const id = c.req.param("requestId");
	if (!UUID_PATTERN.test(id)) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	try {
		const row = await loadRequest(c.env, id);
		// Someone else's request reads as missing, whatever their role.
		if (!row || row.requested_by !== auth.user.id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: row.workspace_id });
		if (!context) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return c.json({ request: view(row, context.workspaceName, isManager(context.role)) }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsKeyRequestsRouter.post("/keys/requests/:requestId/approve", bodyLimit({ maxSize: 4096,
	onError: (c) => c.json({ error: "request_body_too_large" }, 413, PRIVATE_NO_STORE_HEADERS),
}), async (c) => {
	const auth = await dashboardUser(c); if ("response" in auth) return auth.response;
	const id = c.req.param("requestId");
	if (!UUID_PATTERN.test(id)) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const body: { shown?: unknown } = await c.req.json<{ shown?: unknown }>().catch(() => ({}));
	const client = getDataClient(c.env);
	let row: KeyRequestRow | null;
	try { row = await loadRequest(c.env, id); } catch { return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
	if (!row || row.requested_by !== auth.user.id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: row.workspace_id });
	if (!context || !isManager(context.role)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!matchesShown(row, body.shown)) return c.json({ error: "request_changed", message: "Reload the page: this request isn't what was shown." }, 409, PRIVATE_NO_STORE_HEADERS);

	const claimResult = await client.rpc("begin_api_key_request_approval", { p_request_id: id, p_user_id: auth.user.id });
	if (claimResult.error) {
		const message = String(claimResult.error.message ?? "");
		if (message.includes("api_key_request_not_found")) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		if (message.includes("api_key_request_forbidden")) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const claim = (Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data) as ClaimRow | null;
	if (!claim) return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!claim.changed) return c.json({ error: "not_pending", status: claim.status }, 409, PRIVATE_NO_STORE_HEADERS);

	// The key is made from the claimed row: the stored request, not anything the browser sent.
	let created: { id: string; plaintext: string; prefix: string };
	try {
		created = await createWorkspaceApiKey(context, c.env, {
			userId: auth.user.id,
			name: claim.key_name,
			limits: { dailyCostNanos: Number(claim.daily_cost_nanos ?? 0), monthlyCostNanos: Number(claim.monthly_cost_nanos ?? 0) },
			storageLocations: [],
			expiresAt: new Date(Date.now() + claim.key_lifetime_days * 86_400_000).toISOString(),
			auditMetadata: { keyRequestId: id, requestedBy: row.client_name, oauthClientId: row.oauth_client_id, agent: row.agent },
			requestId: requestId(c),
		});
	} catch (error) {
		await client.rpc("abort_api_key_request_approval", { p_request_id: id, p_user_id: auth.user.id });
		const message = error instanceof Error ? error.message : "key_write_failed";
		return c.json({ error: message }, message === "reserved_key_name" ? 400 : 409, PRIVATE_NO_STORE_HEADERS);
	}

	try {
		const sealed = await encryptKeyRequestSecret(String(c.env.KEY_PEPPER_ACTIVE ?? ""), id, created.plaintext);
		const finished = await client.rpc("finish_api_key_request_approval", {
			p_request_id: id,
			p_user_id: auth.user.id,
			p_key_id: created.id,
			p_secret_ciphertext: sealed,
			p_secret_ttl_seconds: SECRET_PICKUP_SECONDS,
		});
		if (finished.error || finished.data !== true) throw finished.error ?? new Error("key_request_not_approving");
	} catch {
		await revokeUnreturnedKey(c.env, created.id).catch(() => undefined);
		await client.rpc("abort_api_key_request_approval", { p_request_id: id, p_user_id: auth.user.id });
		return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ status: "approved", keyId: created.id, prefix: created.prefix }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeyRequestsRouter.post("/keys/requests/:requestId/deny", async (c) => {
	const auth = await dashboardUser(c); if ("response" in auth) return auth.response;
	const id = c.req.param("requestId");
	if (!UUID_PATTERN.test(id)) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const result = await client.rpc("deny_api_key_request", { p_request_id: id, p_user_id: auth.user.id });
	if (result.error) {
		if (String(result.error.message ?? "").includes("api_key_request_not_found")) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "key_request_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const status = String(result.data ?? "");
	if (status === "denied") {
		const row = await loadRequest(c.env, id).catch(() => null);
		if (row) {
			await recordWorkspaceAuditEvent(client, { workspaceId: row.workspace_id, actorUserId: auth.user.id, action: "api_key_request.denied", targetType: "api_key_request", targetId: id, targetName: row.key_name, metadata: { requestedBy: row.client_name, oauthClientId: row.oauth_client_id }, requestId: requestId(c) });
		}
	}
	return c.json({ status }, 200, PRIVATE_NO_STORE_HEADERS);
});
