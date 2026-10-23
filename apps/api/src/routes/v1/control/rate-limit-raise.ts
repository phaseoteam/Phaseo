// Self-serve rate limit raises for Settings → Rate limits: the workspace's
// trust-ladder tier, whether it can raise itself one tier, and the raise.
// Only a dashboard session can use these routes, and only the workspace owner
// can raise: management keys and OAuth tokens are refused, so a leaked key
// cannot lift its own workspace's limits. The thresholds live in the ladder
// configuration (selfServeRaise), and CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED
// turns the feature, and every active raise, off.
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";
import { customerRateLimitLadder, selfServeRaiseStatus, type SelfServeRaiseStatus } from "@core/customer-rate-limit-ladder";
import { publishCustomerRateLimitTier, readCustomerRateLimitInputs } from "@core/customer-rate-limit-tiers";
import { internalServerError } from "./route-helpers";
import { authenticateDashboardSession, type DashboardSession } from "./dashboard-session";

const NO_STORE = { "Cache-Control": "no-store" };
const DAY_MS = 86_400_000;
const SCOPES = [CAPABILITIES.RATE_LIMITS_READ, CAPABILITIES.RATE_LIMITS_WRITE];

function forbidden(message: string) {
	return json({ error: "forbidden", message }, 403, NO_STORE);
}

async function dashboardSession(req: Request): Promise<{ session: DashboardSession } | { response: Response }> {
	const session = await authenticateDashboardSession(req, SCOPES);
	if (session instanceof Response) return { response: session };
	if (!session) return { response: forbidden("Rate limit raises are requested by the workspace owner in the dashboard") };
	if (!["owner", "admin"].includes(session.role)) return { response: forbidden("Only workspace owners and admins can view the workspace's rate limit tier") };
	return { session };
}

function raisesEnabled(): boolean {
	const bindings = getBindings();
	return bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED === "true" && bindings.CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED === "true";
}

/** The workspace's tier and raise status, from fresh inputs (not the published KV value). */
async function currentStatus(workspaceId: string): Promise<SelfServeRaiseStatus | null> {
	const [inputs, last] = await Promise.all([
		readCustomerRateLimitInputs(workspaceId),
		getSupabaseAdmin().from("workspace_rate_limit_raises").select("created_at")
			.eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
	]);
	if (last.error) throw new Error(last.error.message || "Failed to read rate limit raises");
	if (!inputs) return null;
	const lastRequestedAt = last.data ? Date.parse((last.data as { created_at: string }).created_at) : Number.NaN;
	return selfServeRaiseStatus({
		inputs,
		ladder: customerRateLimitLadder(getBindings().CUSTOMER_RATE_LIMIT_LADDER),
		now: Date.now(),
		enabled: raisesEnabled(),
		lastRequestedAt: Number.isFinite(lastRequestedAt) ? lastRequestedAt : null,
	});
}

function body(status: SelfServeRaiseStatus, session: DashboardSession) {
	return { data: { ...status, canRaise: session.role === "owner" && status.eligible } };
}

export async function handleGetRateLimitTier(req: Request) {
	const authorization = await dashboardSession(req);
	if ("response" in authorization) return authorization.response;
	const { session } = authorization;
	try {
		const status = await currentStatus(session.auth.workspaceId);
		if (!status) return json({ error: "not_found", message: "Workspace not found" }, 404, NO_STORE);
		return json(body(status, session), 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limit_tier.get", error);
	}
}

export async function handleRaiseRateLimitTier(req: Request) {
	const authorization = await dashboardSession(req);
	if ("response" in authorization) return authorization.response;
	const { session } = authorization;
	if (session.role !== "owner") return forbidden("Only the workspace owner can raise the workspace's rate limit");
	const workspaceId = session.auth.workspaceId;
	try {
		const status = await currentStatus(workspaceId);
		if (!status) return json({ error: "not_found", message: "Workspace not found" }, 404, NO_STORE);
		if (!status.eligible || !status.target) {
			return json({ error: "raise_unavailable", reason: status.refusal, message: "This workspace cannot raise its rate limit now" }, 409, NO_STORE);
		}
		const now = Date.now();
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_raises").insert({
			workspace_id: workspaceId,
			from_tier: status.tier,
			to_tier: status.target,
			requested_by: session.auth.userId,
			expires_at: new Date(now + status.durationDays * DAY_MS).toISOString(),
		}).select("id,from_tier,to_tier,expires_at").single();
		if (error) throw error;
		const raise = data as { id: string; from_tier: string; to_tier: string; expires_at: string };
		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId,
			actorUserId: session.auth.userId ?? null,
			action: "rate_limit_raise.requested",
			targetType: "workspace_rate_limit_raise",
			targetId: raise.id,
			targetName: raise.to_tier,
			metadata: { from_tier: raise.from_tier, to_tier: raise.to_tier, expires_at: raise.expires_at, requests_per_minute: status.targetRequestsPerMinute },
		});
		// Apply now rather than at the next publisher run; if this fails, that run applies it.
		const inputs = await readCustomerRateLimitInputs(workspaceId);
		if (inputs) {
			await publishCustomerRateLimitTier(inputs, getBindings().CUSTOMER_RATE_LIMIT_LADDER).catch((publishError) => {
				console.warn("rate_limit_raise_publish_failed", { error: publishError instanceof Error ? publishError.message : String(publishError) });
			});
		}
		const updated = await currentStatus(workspaceId);
		return json(body(updated ?? status, session), 201, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limit_tier.raise", error);
	}
}
