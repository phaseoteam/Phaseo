// Workload identity trust policies: which Vercel deployments and GitHub Actions
// workflows may call the gateway with their OIDC token instead of an API key.
// Owners and admins (dashboard sessions, OAuth) and management keys with the
// keys:* scopes manage them, only for workspaces in the gateway_workload_identity
// Statsig gate. Each policy owns a secretless keys row; the gateway reads
// policies with a 30 s cache and their issuers with a 60 s cache, so changes
// apply within a minute.
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { isWorkloadIdentityAccessEnabled } from "@core/feature-flags";
import { presetProviderForIssuer, type WorkloadIdentityProvider } from "@/lib/workload-identity/issuers";
import { REQUIRED_PINNED_CLAIMS, validateWorkloadIdentityPolicy } from "@/lib/workload-identity/policy";
import { WORKLOAD_IDENTITY_AUDIENCE } from "@/lib/workload-identity/verify";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { authenticateDashboardSession } from "./dashboard-session";
import { internalServerError, isResponse, parsePathId, requireCapability, requireJsonBody, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const SCOPES = [CAPABILITIES.KEYS_READ, CAPABILITIES.KEYS_WRITE];
const COLUMNS = "id,workspace_id,key_id,name,provider,issuer,pinned_owner_id,claim_conditions,max_token_lifetime_seconds,status,created_by,created_at,updated_at,keys(kid,status,last_used_at)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Enforced by create_workload_identity_policy(); keep the two in step.
const MAX_POLICIES_PER_WORKSPACE = 50;
const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";

type Row = {
	id: string;
	workspace_id: string;
	key_id: string;
	name: string;
	provider: WorkloadIdentityProvider;
	issuer: string;
	pinned_owner_id: string;
	claim_conditions: Record<string, string[]> | null;
	max_token_lifetime_seconds: number;
	status: "active" | "disabled";
	created_by: string | null;
	created_at: string;
	updated_at: string;
	keys: { kid: string | null; status: string; last_used_at: string | null } | null;
};

function badRequest(message: string, errors?: string[]) {
	return json({ error: "bad_request", message, ...(errors ? { errors } : {}) }, 400, NO_STORE);
}

function forbidden(message: string) {
	return json({ error: "forbidden", message }, 403, NO_STORE);
}

function notFound(message = "Trust policy not found") {
	return json({ error: "not_found", message }, 404, NO_STORE);
}

function format(row: Row) {
	return {
		id: row.id,
		name: row.name,
		provider: row.provider,
		issuer: row.issuer,
		owner_id: row.pinned_owner_id,
		claim_conditions: row.claim_conditions ?? {},
		max_token_lifetime_seconds: row.max_token_lifetime_seconds,
		status: row.status,
		audience: WORKLOAD_IDENTITY_AUDIENCE,
		key_id: row.key_id,
		last_used_at: row.keys?.last_used_at ?? null,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

type PolicyAuth = { workspaceId: string; userId?: string | null };

/**
 * Settings → Trusted workloads uses a dashboard session; Terraform and scripts
 * use a management key or OAuth token with the keys:* scope for the method,
 * since every policy owns a key. OAuth users must be owners or admins.
 */
async function authorize(req: Request, capability: string): Promise<{ auth: PolicyAuth } | { response: Response }> {
	let auth: PolicyAuth;
	const session = await authenticateDashboardSession(req, SCOPES);
	if (session instanceof Response) return { response: session };
	if (session) {
		if (!["owner", "admin"].includes(session.role)) return { response: forbidden("Only workspace owners and admins can manage trusted workloads") };
		auth = session.auth;
	} else {
		const management = await guardManagementAuth(req, { useKvCache: false });
		if (!management.ok) return { response: (management as GuardErr).response };
		const scopeError = requireCapability(management.value, capability);
		if (scopeError) return { response: scopeError };
		const roleError = await requireOAuthWorkspaceRole(management.value, management.value.workspaceId, ["owner", "admin"]);
		if (roleError) return { response: roleError };
		auth = management.value;
	}
	// Outside the rollout the feature does not exist for the workspace.
	if (!(await isWorkloadIdentityAccessEnabled({ workspaceId: auth.workspaceId }))) return { response: notFound("Trusted workloads are not available for this workspace") };
	return { auth };
}

function pathId(req: Request): string | null {
	const id = parsePathId(new URL(req.url), "policies");
	return id && UUID.test(id) ? id.toLowerCase() : null;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function parseConditions(value: unknown): Record<string, string[]> | null {
	if (value === undefined || value === null) return {};
	if (typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, string[]>;
}

/**
 * Validates a policy with its pinned owner folded into the conditions, as the
 * gateway matches it, then splits the owner back out for its indexed column.
 */
function validate(input: {
	provider: WorkloadIdentityProvider;
	issuer: string;
	ownerId: string;
	conditions: Record<string, string[]>;
	maxTokenLifetimeSeconds?: number;
}): { ok: true; conditions: Record<string, string[]>; maxTokenLifetimeSeconds: number } | { ok: false; errors: string[] } {
	const pinnedClaim = REQUIRED_PINNED_CLAIMS[input.provider]?.[0];
	if (!pinnedClaim) return { ok: false, errors: ["provider must be vercel or github_actions"] };
	if (Object.hasOwn(input.conditions, pinnedClaim)) {
		return { ok: false, errors: [`set ${pinnedClaim} with owner_id, not in claim_conditions`] };
	}
	const result = validateWorkloadIdentityPolicy({
		provider: input.provider,
		issuer: input.issuer,
		claimConditions: { ...input.conditions, [pinnedClaim]: input.ownerId ? [input.ownerId] : [] },
		maxTokenLifetimeSeconds: input.maxTokenLifetimeSeconds,
	});
	if (result.ok === false) return result;
	const { [pinnedClaim]: _pinned, ...conditions } = result.value.claimConditions;
	return { ok: true, conditions, maxTokenLifetimeSeconds: result.value.maxTokenLifetimeSeconds };
}

async function audit(auth: PolicyAuth, action: string, row: Pick<Row, "id" | "name" | "provider" | "issuer" | "pinned_owner_id" | "key_id">, extra: Record<string, unknown> = {}) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: auth.userId ?? null,
		action: `workload_identity_policy.${action}`,
		targetType: "workload_identity_policy",
		targetId: row.id,
		targetName: row.name,
		metadata: { provider: row.provider, issuer: row.issuer, owner_id: row.pinned_owner_id, key_id: row.key_id, ...extra },
	});
}

async function loadRow(workspaceId: string, id: string): Promise<Row | null> {
	const { data, error } = await getSupabaseAdmin()
		.from("workload_identity_policies")
		.select(COLUMNS)
		.eq("workspace_id", workspaceId)
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	return (data as unknown as Row | null) ?? null;
}

async function handleList(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.KEYS_READ);
	if ("response" in authorization) return authorization.response;
	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workload_identity_policies")
			.select(COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId)
			.order("created_at", { ascending: true })
			.limit(MAX_POLICIES_PER_WORKSPACE);
		if (error) throw error;
		return json({ data: ((data ?? []) as unknown as Row[]).map(format), audience: WORKLOAD_IDENTITY_AUDIENCE }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workload_identity.policies.list", error);
	}
}

async function handleGet(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.KEYS_READ);
	if ("response" in authorization) return authorization.response;
	const id = pathId(req);
	if (!id) return notFound();
	try {
		const row = await loadRow(authorization.auth.workspaceId, id);
		return row ? json({ data: format(row) }, 200, NO_STORE) : notFound();
	} catch (error) {
		return internalServerError("workload_identity.policies.get", error);
	}
}

async function handleCreate(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.KEYS_WRITE);
	if ("response" in authorization) return authorization.response;
	const { auth } = authorization;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;

	const name = text(body.name);
	if (!name || name.length > 100) return badRequest("name must be 1 to 100 characters");
	const provider = text(body.provider) as WorkloadIdentityProvider;
	if (provider !== "vercel" && provider !== "github_actions") return badRequest("provider must be vercel or github_actions");
	// GitHub has one issuer unless an enterprise customised it; Vercel's depends on the team's issuer mode.
	const issuer = text(body.issuer) || (provider === "github_actions" ? GITHUB_ACTIONS_ISSUER : "");
	if (presetProviderForIssuer(issuer) !== provider) return badRequest(`issuer is not a ${provider} issuer`);
	const conditions = parseConditions(body.claim_conditions);
	if (!conditions) return badRequest("claim_conditions must be an object of claim names to value lists");
	const lifetime = body.max_token_lifetime_seconds === undefined ? undefined : Number(body.max_token_lifetime_seconds);
	const ownerId = text(body.owner_id);
	const validated = validate({ provider, issuer, ownerId, conditions, maxTokenLifetimeSeconds: lifetime });
	if (validated.ok === false) return badRequest("Invalid trust policy", validated.errors);

	const workspaceId = auth.workspaceId;
	try {
		// The function enforces the cap under a per-workspace lock.
		const { data, error } = await getSupabaseAdmin().rpc("create_workload_identity_policy", {
			p_workspace_id: workspaceId,
			p_created_by: auth.userId ?? null,
			p_name: name,
			p_provider: provider,
			p_issuer: issuer,
			p_pinned_owner_id: ownerId,
			p_claim_conditions: validated.conditions,
			p_max_token_lifetime_seconds: validated.maxTokenLifetimeSeconds,
		});
		if (error && String(error.message ?? "").includes("workload_identity_policy_limit")) {
			return json({ error: "limit_reached", message: `A workspace can have up to ${MAX_POLICIES_PER_WORKSPACE} trust policies` }, 409, NO_STORE);
		}
		if (error) throw error;
		const created = (data as Array<{ policy_id: string }> | null)?.[0];
		if (!created) throw new Error("create_workload_identity_policy returned no row");
		const row = await loadRow(workspaceId, created.policy_id);
		if (!row) throw new Error("created policy not found");
		await audit(auth, "created", row, { claim_conditions: row.claim_conditions });
		return json({ data: format(row) }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("workload_identity.policies.create", error);
	}
}

async function handleUpdate(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.KEYS_WRITE);
	if ("response" in authorization) return authorization.response;
	const { auth } = authorization;
	const id = pathId(req);
	if (!id) return notFound();
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	// Issuer, provider and owner identify what is trusted; change them with a new policy.
	for (const field of ["provider", "issuer", "owner_id"]) {
		if (field in body) return badRequest(`${field} cannot be changed; create a new trust policy instead`);
	}

	try {
		const existing = await loadRow(auth.workspaceId, id);
		if (!existing) return notFound();
		const update: Record<string, unknown> = {};
		if ("name" in body) {
			const name = text(body.name);
			if (!name || name.length > 100) return badRequest("name must be 1 to 100 characters");
			update.name = name;
		}
		if ("status" in body) {
			if (body.status !== "active" && body.status !== "disabled") return badRequest("status must be active or disabled");
			update.status = body.status;
		}
		if ("claim_conditions" in body || "max_token_lifetime_seconds" in body) {
			const conditions = "claim_conditions" in body ? parseConditions(body.claim_conditions) : existing.claim_conditions ?? {};
			if (!conditions) return badRequest("claim_conditions must be an object of claim names to value lists");
			const lifetime = "max_token_lifetime_seconds" in body ? Number(body.max_token_lifetime_seconds) : existing.max_token_lifetime_seconds;
			const validated = validate({
				provider: existing.provider,
				issuer: existing.issuer,
				ownerId: existing.pinned_owner_id,
				conditions,
				maxTokenLifetimeSeconds: lifetime,
			});
			if (validated.ok === false) return badRequest("Invalid trust policy", validated.errors);
			update.claim_conditions = validated.conditions;
			update.max_token_lifetime_seconds = validated.maxTokenLifetimeSeconds;
		}
		if (Object.keys(update).length === 0) return badRequest("Nothing to update");
		update.updated_at = new Date().toISOString();

		const { error } = await getSupabaseAdmin()
			.from("workload_identity_policies")
			.update(update)
			.eq("workspace_id", auth.workspaceId)
			.eq("id", id);
		if (error) throw error;
		const row = await loadRow(auth.workspaceId, id);
		if (!row) return notFound();
		const { updated_at: _updatedAt, ...changes } = update;
		await audit(auth, "updated", row, { changes });
		return json({ data: format(row) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workload_identity.policies.update", error);
	}
}

async function handleDelete(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.KEYS_DELETE);
	if ("response" in authorization) return authorization.response;
	const { auth } = authorization;
	const id = pathId(req);
	if (!id) return notFound();
	try {
		const existing = await loadRow(auth.workspaceId, id);
		if (!existing) return notFound();
		const supabase = getSupabaseAdmin();
		// Revoke the key first so the policy can never match again, then remove
		// the policy. The revoked key row stays so past requests keep their key.
		const now = new Date().toISOString();
		const revoked = await supabase
			.from("keys")
			.update({ status: "revoked", revoked_at: now, revoked_reason: "workload_identity_policy_deleted" })
			.eq("workspace_id", auth.workspaceId)
			.eq("id", existing.key_id)
			.eq("key_kind", "workload_identity");
		if (revoked.error) throw revoked.error;
		const removed = await supabase
			.from("workload_identity_policies")
			.delete()
			.eq("workspace_id", auth.workspaceId)
			.eq("id", id);
		if (removed.error) throw removed.error;
		await audit(auth, "deleted", existing);
		return json({ data: { id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workload_identity.policies.delete", error);
	}
}

export const workloadIdentityRoutes = new Hono<Env>();
workloadIdentityRoutes.get("/policies", withRuntime(handleList));
workloadIdentityRoutes.post("/policies", withRuntime(handleCreate));
workloadIdentityRoutes.get("/policies/:id", withRuntime(handleGet));
workloadIdentityRoutes.patch("/policies/:id", withRuntime(handleUpdate));
workloadIdentityRoutes.delete("/policies/:id", withRuntime(handleDelete));
