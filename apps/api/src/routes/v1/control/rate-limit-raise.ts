// Self-serve rate limit raises for Settings → Rate limits: the workspace's
// trust-ladder tier, whether it can raise itself one tier, and the raise.
// The dashboard session and OAuth tokens act as a person, so the dashboard's
// rules apply to both: owners and admins see the tier and only the workspace
// owner can raise. A management key belongs to no person, so it can read the
// tier but never raise: a leaked key cannot lift its own workspace's limits.
// The thresholds live in the ladder
// configuration (selfServeRaise), and CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED
// turns the feature, and every active raise, off.
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";
import { customerRateLimitLadder, selfServeRaiseStatus, type SelfServeRaiseStatus } from "@core/customer-rate-limit-ladder";
import { publishCustomerRateLimitTier, readCustomerRateLimitInputs } from "@core/customer-rate-limit-tiers";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { internalServerError, requireCapability } from "./route-helpers";
import { authenticateDashboardSession, workspaceRole } from "./dashboard-session";

const NO_STORE = { "Cache-Control": "no-store" };
const DAY_MS = 86_400_000;
const SCOPES = [CAPABILITIES.RATE_LIMITS_READ, CAPABILITIES.RATE_LIMITS_WRITE];

function forbidden(message: string) {
	return json({ error: "forbidden", message }, 403, NO_STORE);
}

/** Who is asking: role is the person's workspace role, or null for a management key. */
type Caller = { workspaceId: string; userId: string | null; role: string | null };

async function authorize(req: Request, scope: string): Promise<{ caller: Caller } | { response: Response }> {
	const session = await authenticateDashboardSession(req, SCOPES);
	if (session instanceof Response) return { response: session };
	let caller: Caller;
	if (session) {
		caller = { workspaceId: session.auth.workspaceId, userId: session.auth.userId ?? null, role: session.role };
	} else {
		const auth = await guardManagementAuth(req, { useKvCache: false });
		if (!auth.ok) return { response: (auth as GuardErr).response };
		const scopeError = requireCapability(auth.value, scope);
		if (scopeError) return { response: scopeError };
		if (auth.value.authMethod === "oauth") {
			const userId = auth.value.userId?.trim();
			if (!userId) return { response: forbidden("OAuth user is required") };
			const role = await workspaceRole(auth.value.workspaceId, userId);
			if (role === null) return { response: forbidden("Workspace membership is required") };
			caller = { workspaceId: auth.value.workspaceId, userId, role };
		} else {
			caller = { workspaceId: auth.value.workspaceId, userId: null, role: null };
		}
	}
	if (caller.role !== null && !["owner", "admin"].includes(caller.role)) {
		return { response: forbidden("Only workspace owners and admins can view the workspace's rate limit tier") };
	}
	return { caller };
}

function raisesEnabled(): boolean {
	const bindings = getBindings();
	return bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED === "true" && bindings.CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED === "true";
}

/**
 * The workspace's tier and raise status, from fresh inputs (not the published KV value).
 * `lastRequestedAt` is the newest raise's created_at exactly as Postgres returned it.
 */
async function readStatus(workspaceId: string): Promise<{ status: SelfServeRaiseStatus; lastRequestedAt: string | null } | null> {
	const [inputs, last] = await Promise.all([
		readCustomerRateLimitInputs(workspaceId),
		getSupabaseAdmin().from("workspace_rate_limit_raises").select("created_at")
			.eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
	]);
	if (last.error) throw new Error(last.error.message || "Failed to read rate limit raises");
	if (!inputs) return null;
	const lastRequestedAt = last.data ? (last.data as { created_at: string }).created_at : null;
	const lastRequestedMs = lastRequestedAt ? Date.parse(lastRequestedAt) : Number.NaN;
	const status = selfServeRaiseStatus({
		inputs,
		ladder: customerRateLimitLadder(getBindings().CUSTOMER_RATE_LIMIT_LADDER),
		now: Date.now(),
		enabled: raisesEnabled(),
		lastRequestedAt: Number.isFinite(lastRequestedMs) ? lastRequestedMs : null,
	});
	return { status, lastRequestedAt };
}

async function currentStatus(workspaceId: string): Promise<SelfServeRaiseStatus | null> {
	return (await readStatus(workspaceId))?.status ?? null;
}

const raiseUnavailable = (reason: string | null) =>
	json({ error: "raise_unavailable", reason, message: "This workspace cannot raise its rate limit now" }, 409, NO_STORE);

function body(status: SelfServeRaiseStatus, caller: Caller) {
	return { data: { ...status, canRaise: caller.role === "owner" && status.eligible } };
}

export async function handleGetRateLimitTier(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const { caller } = authorization;
	try {
		const status = await currentStatus(caller.workspaceId);
		if (!status) return json({ error: "not_found", message: "Workspace not found" }, 404, NO_STORE);
		return json(body(status, caller), 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limit_tier.get", error);
	}
}

export async function handleRaiseRateLimitTier(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const { caller } = authorization;
	if (caller.role === null) return forbidden("Management keys cannot raise rate limits; the workspace owner raises them with an OAuth sign-in or in the dashboard");
	if (caller.role !== "owner") return forbidden("Only the workspace owner can raise the workspace's rate limit");
	const workspaceId = caller.workspaceId;
	try {
		const read = await readStatus(workspaceId);
		if (!read) return json({ error: "not_found", message: "Workspace not found" }, 404, NO_STORE);
		const { status } = read;
		if (!status.eligible || !status.target) return raiseUnavailable(status.refusal);
		const now = Date.now();
		// Inserted only if no other raise was recorded since the read above, so
		// concurrent requests cannot both pass the eligibility check.
		const { data, error } = await getSupabaseAdmin().rpc("request_workspace_rate_limit_raise", {
			p_workspace_id: workspaceId,
			p_from_tier: status.tier,
			p_to_tier: status.target,
			p_requested_by: caller.userId,
			p_expires_at: new Date(now + status.durationDays * DAY_MS).toISOString(),
			p_last_requested_at: read.lastRequestedAt,
		});
		if (error) throw error;
		const raise = (data as Array<{ id: string; from_tier: string; to_tier: string; expires_at: string }> | null)?.[0];
		if (!raise) return raiseUnavailable("raised");
		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId,
			actorUserId: caller.userId,
			action: "rate_limit_raise.requested",
			targetType: "workspace_rate_limit_raise",
			targetId: raise.id,
			targetName: raise.to_tier,
			metadata: { from_tier: raise.from_tier, to_tier: raise.to_tier, expires_at: raise.expires_at, requests_per_minute: status.targetRequestsPerMinute },
		});
		// The raise is saved from here on, so nothing below may turn it into an error.
		// Apply now rather than at the next publisher run; if this fails, that run applies it.
		try {
			const inputs = await readCustomerRateLimitInputs(workspaceId);
			if (inputs) await publishCustomerRateLimitTier(inputs, getBindings().CUSTOMER_RATE_LIMIT_LADDER);
		} catch (publishError) {
			console.warn("rate_limit_raise_publish_failed", { error: publishError instanceof Error ? publishError.message : String(publishError) });
		}
		const raised: SelfServeRaiseStatus = {
			...status,
			tier: status.target,
			requestsPerMinute: status.targetRequestsPerMinute ?? status.requestsPerMinute,
			eligible: false,
			refusal: "raised",
			activeUntil: Date.parse(raise.expires_at),
			availableAt: null,
		};
		const updated = await currentStatus(workspaceId).catch(() => null);
		return json(body(updated ?? raised, caller), 201, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limit_tier.raise", error);
	}
}
