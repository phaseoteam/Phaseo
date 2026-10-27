import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { callGatewayControl, type GatewayResult } from "./gateway-control";

// Settings → Trusted workloads. Every read and write goes through the gateway's
// /v1/workload-identity routes with the user's session: the gateway owns the
// Statsig rollout gate, validates policies the same way it matches tokens, and
// records the audit events. Only owners and admins manage trust policies.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILURE_EVENT = "workload_identity_gateway_proxy_failed";
export const WORKLOAD_IDENTITY_AUDIENCE = "https://api.phaseo.app";

type Body = Record<string, unknown>;

function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

function isManager(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

function emptyData(workspaceId: string | null, available = false) {
	return { workspaceId, available, canManage: false, audience: WORKLOAD_IDENTITY_AUDIENCE, policies: [] };
}

function formatPolicy(row: any) {
	return {
		id: String(row.id),
		name: String(row.name ?? ""),
		provider: row.provider === "github_actions" ? "github_actions" : "vercel",
		issuer: String(row.issuer ?? ""),
		ownerId: String(row.owner_id ?? ""),
		claimConditions: row.claim_conditions && typeof row.claim_conditions === "object" ? row.claim_conditions as Record<string, string[]> : {},
		maxTokenLifetimeSeconds: Number(row.max_token_lifetime_seconds) || 0,
		status: row.status === "disabled" ? "disabled" : "active",
		lastUsedAt: row.last_used_at ?? null,
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
	};
}

export const accountSettingsWorkloadIdentityRouter = new Hono<{ Bindings: Env }>();

accountSettingsWorkloadIdentityRouter.get("/trusted-workloads", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return json(c, emptyData(null));
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return json(c, { error: "forbidden" }, 403);
	if (!isManager(context)) return json(c, emptyData(workspaceId, true));
	const result: GatewayResult = await callGatewayControl({
		env: c.env,
		request: c.req.raw,
		workspaceId,
		method: "GET",
		path: "/v1/workload-identity/policies",
		failureEvent: FAILURE_EVENT,
	});
	// The gateway answers 404 for workspaces outside the rollout.
	if (result.status === 404) return json(c, emptyData(workspaceId));
	if (result.status !== 200) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, {
		workspaceId,
		available: true,
		canManage: true,
		audience: typeof result.payload?.audience === "string" ? result.payload.audience : WORKLOAD_IDENTITY_AUDIENCE,
		policies: (Array.isArray(result.payload?.data) ? result.payload.data : []).map(formatPolicy),
	});
});

/** Forwards a write to the gateway; the body's workspaceId selects the workspace and is not sent on. */
async function forward(c: any, method: string, path: string, withBody: boolean) {
	const { workspaceId, ...input } = await readBody(c);
	const result: GatewayResult = await callGatewayControl({
		env: c.env,
		request: c.req.raw,
		workspaceId: String(workspaceId ?? ""),
		method,
		path: `/v1/workload-identity${path}`,
		body: withBody ? input : undefined,
		failureEvent: FAILURE_EVENT,
	});
	if (result.status < 200 || result.status >= 300) {
		// The dashboard client shows one message, so fold validation errors into it.
		const errors = Array.isArray(result.payload?.errors) ? result.payload.errors.filter((entry: unknown) => typeof entry === "string") : [];
		return json(c, errors.length ? { ...result.payload, message: errors.join("; ") } : result.payload, result.status);
	}
	return json(c, { ok: true, id: result.payload?.data?.id ?? null }, result.status);
}

function policyPath(c: any): string | null {
	const id = String(c.req.param("id") ?? "").trim();
	return UUID_PATTERN.test(id) ? `/policies/${id.toLowerCase()}` : null;
}

function invalidId(c: any) {
	return json(c, { error: "bad_request", message: "Invalid id" }, 400);
}

accountSettingsWorkloadIdentityRouter.post("/trusted-workloads/policies", (c) => forward(c, "POST", "/policies", true));
accountSettingsWorkloadIdentityRouter.patch("/trusted-workloads/policies/:id", (c) => {
	const path = policyPath(c);
	return path ? forward(c, "PATCH", path, true) : invalidId(c);
});
accountSettingsWorkloadIdentityRouter.delete("/trusted-workloads/policies/:id", (c) => {
	const path = policyPath(c);
	return path ? forward(c, "DELETE", path, false) : invalidId(c);
});
