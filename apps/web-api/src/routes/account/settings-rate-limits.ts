import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { callGatewayControl, type GatewayResult } from "./gateway-control";

// Settings → Rate limits. Reads come straight from the database. Writes go
// through the gateway's /v1/rate-limits routes with the user's session, because
// the gateway validates them, records the audit event and republishes the
// workspace's enforcement plan at once; a direct table write would only be
// enforced after the 15-minute reconcile.
//
// Policies and their targets name keys and members, so only owners and admins
// can see them, as on the classifiers page.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLICY_COLUMNS = "id,name,description,requests_per_minute,tokens_per_minute,concurrent_requests,fail_closed,updated_at";
const ASSIGNMENT_COLUMNS = "id,policy_id,target_type,key_id,user_id,department_id,guardrail_id";
/** The gateway's page limit; the page lists every policy in one request. */
const MAX_POLICIES = 250;
const MAX_ASSIGNMENTS = 1000;
export const THROTTLE_WINDOW_HOURS = 24;

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

function numberOrNull(value: unknown): number | null {
	return value == null ? null : Number(value);
}

function assignmentTargetId(row: any): string | null {
	switch (row.target_type) {
		case "key": return row.key_id;
		case "member": return row.user_id;
		case "department": return row.department_id;
		case "guardrail": return row.guardrail_id;
		default: return null;
	}
}

function emptyData(workspaceId: string | null) {
	return {
		workspaceId,
		canManageRateLimits: false,
		policies: [],
		assignments: [],
		targets: { keys: [], members: [], departments: [], guardrails: [] },
		throttles: [],
		throttleWindowHours: THROTTLE_WINDOW_HOURS,
		tier: null,
	};
}

const TIER_READ_BUDGET_MS = 2_500;

/**
 * The workspace's trust-ladder tier and self-serve raise status, from the
 * gateway (which holds the ladder configuration). Null when it can't be read
 * within TIER_READ_BUDGET_MS, so a slow gateway can't hold up the rest of the page.
 */
async function readTier(c: any, workspaceId: string): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<GatewayResult>((resolve) => {
		timer = setTimeout(() => resolve({ status: 0, payload: null }), TIER_READ_BUDGET_MS);
	});
	const read = callGatewayControl({
		env: c.env,
		request: c.req.raw,
		workspaceId,
		method: "GET",
		path: "/v1/rate-limits/tier",
		failureEvent: "rate_limits_gateway_proxy_failed",
	}).catch((): GatewayResult => ({ status: 0, payload: null }));
	const result = await Promise.race([read, timedOut]).finally(() => clearTimeout(timer));
	return result.status === 200 && result.payload?.data ? result.payload.data : null;
}

export const accountSettingsRateLimitsRouter = new Hono<{ Bindings: Env }>();

accountSettingsRateLimitsRouter.get("/rate-limits", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return json(c, emptyData(null));
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return json(c, { error: "forbidden" }, 403);
	if (!isManager(context)) return json(c, emptyData(workspaceId));
	const since = new Date(Date.now() - THROTTLE_WINDOW_HOURS * 3_600_000).toISOString();
	const [policies, assignments, keys, members, departments, guardrails, throttles, tier] = await Promise.all([
		context.client.from("workspace_rate_limit_policies").select(POLICY_COLUMNS)
			.eq("workspace_id", workspaceId).order("name", { ascending: true }).limit(MAX_POLICIES),
		context.client.from("workspace_rate_limit_policy_assignments").select(ASSIGNMENT_COLUMNS)
			.eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(MAX_ASSIGNMENTS),
		context.client.from("keys").select("id,name,prefix,status")
			.eq("workspace_id", workspaceId).neq("status", "deleted")
			.neq("name", "__chat_route_managed_key__").order("created_at", { ascending: false }),
		context.client.from("workspace_members").select("user_id,role,users(display_name)")
			.eq("workspace_id", workspaceId),
		context.client.from("workspace_departments").select("id,name")
			.eq("workspace_id", workspaceId).order("name", { ascending: true }),
		context.client.from("workspace_guardrails").select("id,name")
			.eq("workspace_id", workspaceId).order("name", { ascending: true }),
		// Summed in the database from the per-minute rollup.
		context.client.rpc("workspace_rate_limit_throttle_summary", { p_workspace_id: workspaceId, p_since: since }),
		readTier(c, workspaceId),
	]);
	if ([policies, assignments, keys, members, departments, guardrails, throttles].some((result) => result.error)) {
		return json(c, { error: "settings_unavailable" }, 503);
	}
	return json(c, {
		workspaceId,
		canManageRateLimits: true,
		policies: (policies.data ?? []).map((row: any) => ({
			id: row.id,
			name: row.name,
			description: row.description ?? null,
			requestsPerMinute: numberOrNull(row.requests_per_minute),
			tokensPerMinute: numberOrNull(row.tokens_per_minute),
			concurrentRequests: numberOrNull(row.concurrent_requests),
			failClosed: row.fail_closed === true,
			updatedAt: row.updated_at,
		})),
		assignments: (assignments.data ?? []).map((row: any) => ({
			id: row.id,
			policyId: row.policy_id,
			targetType: row.target_type,
			targetId: assignmentTargetId(row),
		})),
		targets: {
			keys: (keys.data ?? []).map((key: any) => ({ id: key.id, name: key.name, prefix: key.prefix, status: key.status })),
			members: (members.data ?? []).map((member: any) => ({
				id: member.user_id,
				name: member.users?.display_name ?? null,
				role: member.role,
			})),
			departments: (departments.data ?? []).map((department: any) => ({ id: department.id, name: department.name })),
			guardrails: (guardrails.data ?? []).map((guardrail: any) => ({ id: guardrail.id, name: guardrail.name })),
		},
		throttles: (Array.isArray(throttles.data) ? throttles.data : []).map((row: any) => ({
			policyId: row.policy_id,
			throttledRequests: Number(row.throttled_requests) || 0,
			lastThrottledAt: row.last_throttled_at ?? null,
		})),
		throttleWindowHours: THROTTLE_WINDOW_HOURS,
		tier,
	});
});

// The gateway allows only the workspace owner to raise, and checks eligibility itself.
accountSettingsRateLimitsRouter.post("/rate-limits/tier/raise", (c) => forward(c, "POST", "/tier/raise", false));

/** Forwards a write to the gateway; the body's workspaceId selects the workspace and is not sent on. */
async function forward(c: any, method: string, path: string, withBody: boolean) {
	const { workspaceId, ...input } = await readBody(c);
	const result: GatewayResult = await callGatewayControl({
		env: c.env,
		request: c.req.raw,
		workspaceId: String(workspaceId ?? ""),
		method,
		path: `/v1/rate-limits${path}`,
		body: withBody ? input : undefined,
		failureEvent: "rate_limits_gateway_proxy_failed",
	});
	if (result.status < 200 || result.status >= 300) return json(c, result.payload, result.status);
	return json(c, { ok: true, id: result.payload?.data?.id ?? null }, result.status);
}

function withId(c: any, collection: "policies" | "assignments"): string | null {
	const id = String(c.req.param("id") ?? "").trim();
	return UUID_PATTERN.test(id) ? `/${collection}/${id.toLowerCase()}` : null;
}

function invalidId(c: any) {
	return json(c, { error: "bad_request", message: "Invalid id" }, 400);
}

for (const collection of ["policies", "assignments"] as const) {
	accountSettingsRateLimitsRouter.post(`/rate-limits/${collection}`, (c) => forward(c, "POST", `/${collection}`, true));
	accountSettingsRateLimitsRouter.patch(`/rate-limits/${collection}/:id`, (c) => {
		const path = withId(c, collection);
		return path ? forward(c, "PATCH", path, true) : invalidId(c);
	});
	accountSettingsRateLimitsRouter.delete(`/rate-limits/${collection}/:id`, (c) => {
		const path = withId(c, collection);
		return path ? forward(c, "DELETE", path, false) : invalidId(c);
	});
}
