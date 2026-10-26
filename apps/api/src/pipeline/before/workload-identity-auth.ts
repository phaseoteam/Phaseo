// Purpose: Authenticate gateway requests that carry a Vercel or GitHub Actions OIDC token.
// Why: Lets a workspace trust its own deployments and CI jobs instead of storing a
// long-lived API key there.
// How: Verify the token, match it to exactly one active trust policy, then act as
// that policy's secretless key so limits, budgets, logs and billing are unchanged.

import { getSupabaseAdmin, type GatewayBindings } from "@/runtime/env";
import { shouldRecordLastUsed } from "@/core/last-used-throttle";
import { isKeyIpAllowed } from "@/lib/security/keyIpAllowlist";
import { presetProviderForIssuer, type WorkloadIdentityProvider } from "@/lib/workload-identity/issuers";
import { matchWorkloadIdentityPolicy, REQUIRED_PINNED_CLAIMS, type WorkloadIdentityPolicy } from "@/lib/workload-identity/policy";
import { createJwksSource, readUnverifiedIssuer, verifyWorkloadToken, type JwksSource } from "@/lib/workload-identity/verify";
import type { AuthFailure, AuthSuccess } from "./auth";

// Policy and verified-token caches share the key cache's revocation window.
const POLICY_L1_TTL_MS = 30_000;
const POLICY_L1_MAX_ENTRIES = 1_000;
const TOKEN_L1_TTL_MS = 30_000;
const TOKEN_L1_MAX_ENTRIES = 5_000;
export const WORKLOAD_IDENTITY_WORKSPACE_HEADER = "x-phaseo-workspace";

type PolicyKeyRow = {
	id: string;
	kid: string | null;
	workspace_id: string;
	status: string;
	key_kind: string | null;
	expires_at: string | null;
	ip_allowlist: unknown;
	created_by: string | null;
};

type PolicyRow = {
	id: string;
	workspace_id: string;
	key_id: string;
	provider: WorkloadIdentityProvider;
	issuer: string;
	pinned_owner_id: string;
	audiences: string[];
	claim_conditions: Record<string, string[]> | null;
	max_token_lifetime_seconds: number;
	status: "active" | "disabled";
	keys: PolicyKeyRow | null;
};

type CandidatePolicy = WorkloadIdentityPolicy & { key: PolicyKeyRow };

const policyL1 = new Map<string, { policies: CandidatePolicy[]; expiresAt: number }>();
const tokenL1 = new Map<string, { result: AuthSuccess; keyId: string; ipAllowlist: unknown; expiresAt: number }>();

export function __resetWorkloadIdentityAuthCachesForTests(): void {
	policyL1.clear();
	tokenL1.clear();
}

export function isWorkloadIdentityAuthEnabled(bindings: Pick<GatewayBindings, "WORKLOAD_IDENTITY_AUTH_ENABLED">): boolean {
	return bindings.WORKLOAD_IDENTITY_AUTH_ENABLED === "true";
}

/** Cheap routing check: an unverified `iss` naming a supported platform. */
export function isWorkloadIdentityToken(token: string): boolean {
	const issuer = readUnverifiedIssuer(token);
	return issuer !== null && presetProviderForIssuer(issuer) !== null;
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
	map.delete(key);
	map.set(key, value);
	while (map.size > maxEntries) {
		const oldest = map.keys().next().value as K;
		map.delete(oldest);
	}
}

async function sha256Hex(value: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toCandidate(row: PolicyRow): CandidatePolicy | null {
	if (!row.keys) return null;
	const pinnedClaim = REQUIRED_PINNED_CLAIMS[row.provider]?.[0];
	if (!pinnedClaim) return null;
	const conditions = { ...(row.claim_conditions ?? {}) };
	// The pinned owner is stored in its own indexed column.
	conditions[pinnedClaim] = [row.pinned_owner_id];
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		keyId: row.key_id,
		provider: row.provider,
		issuer: row.issuer,
		audiences: row.audiences ?? [],
		claimConditions: conditions,
		maxTokenLifetimeSeconds: row.max_token_lifetime_seconds,
		status: row.status,
		key: row.keys,
	};
}

async function loadCandidatePolicies(issuer: string, ownerId: string): Promise<CandidatePolicy[] | "db_error"> {
	const cacheKey = `${issuer}\n${ownerId}`;
	const cached = policyL1.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.policies;
	const { data, error } = await getSupabaseAdmin()
		.from("workload_identity_policies")
		.select("id,workspace_id,key_id,provider,issuer,pinned_owner_id,audiences,claim_conditions,max_token_lifetime_seconds,status,keys(id,kid,workspace_id,status,key_kind,expires_at,ip_allowlist,created_by)")
		.eq("issuer", issuer)
		.eq("pinned_owner_id", ownerId)
		.eq("status", "active");
	if (error) return "db_error";
	const policies = ((data ?? []) as unknown as PolicyRow[])
		.map(toCandidate)
		.filter((policy): policy is CandidatePolicy => policy !== null);
	setBounded(policyL1, cacheKey, { policies, expiresAt: Date.now() + POLICY_L1_TTL_MS }, POLICY_L1_MAX_ENTRIES);
	return policies;
}

function claimAsString(value: unknown): string | null {
	if (typeof value === "string" && value.length > 0) return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

export type WorkloadIdentityAuthResult = {
	result: AuthSuccess | AuthFailure;
	/** Background write of `keys.last_used_at`, run once the request is admitted. */
	usageTask?: () => Promise<unknown>;
};

export async function authenticateWorkloadIdentity(
	req: Request,
	token: string,
	deps: { jwks?: JwksSource; kv?: KVNamespace | null; nowMs?: number } = {},
): Promise<WorkloadIdentityAuthResult> {
	const nowMs = deps.nowMs ?? Date.now();
	const workspaceHint = req.headers.get(WORKLOAD_IDENTITY_WORKSPACE_HEADER)?.trim() || null;
	const clientIp = req.headers.get("cf-connecting-ip");
	const tokenKey = await sha256Hex(`${workspaceHint ?? ""}\n${token}`);

	const cached = tokenL1.get(tokenKey);
	if (cached && cached.expiresAt > nowMs) {
		// IP policy depends on the caller, so it is checked on every request.
		if (!isKeyIpAllowed(cached.ipAllowlist, clientIp)) return { result: { ok: false, reason: "key_ip_not_allowed" } };
		return { result: cached.result };
	}

	const verified = await verifyWorkloadToken(token, {
		jwks: deps.jwks ?? createJwksSource({ kv: deps.kv ?? null }),
		nowSeconds: Math.floor(nowMs / 1000),
	});
	if (verified.ok === false) return { result: { ok: false, reason: verified.reason } };

	const pinnedClaim = REQUIRED_PINNED_CLAIMS[verified.provider][0];
	const ownerId = claimAsString(verified.claims[pinnedClaim]);
	if (!ownerId) return { result: { ok: false, reason: "workload_identity_no_matching_policy" } };

	const policies = await loadCandidatePolicies(verified.claims.iss, ownerId);
	if (policies === "db_error") return { result: { ok: false, reason: "db_error" } };
	const match = matchWorkloadIdentityPolicy(verified.claims, policies, { workspaceId: workspaceHint });
	if (match.ok === false) return { result: { ok: false, reason: match.reason } };

	const key = (match.policy as CandidatePolicy).key;
	const keyExpiresAt = key.expires_at ? Date.parse(key.expires_at) : Number.NaN;
	if (
		key.status !== "active" ||
		key.key_kind !== "workload_identity" ||
		key.workspace_id !== match.policy.workspaceId ||
		!key.kid
	) {
		return { result: { ok: false, reason: "key_not_found_or_revoked" } };
	}
	if (Number.isFinite(keyExpiresAt) && keyExpiresAt <= nowMs) return { result: { ok: false, reason: "key_expired" } };
	if (!isKeyIpAllowed(key.ip_allowlist, clientIp)) return { result: { ok: false, reason: "key_ip_not_allowed" } };

	const result: AuthSuccess = {
		ok: true,
		apiKeyId: key.id,
		apiKeyRef: `kid_${key.kid}`,
		apiKeyKid: key.kid,
		workspaceId: key.workspace_id,
		userId: key.created_by ?? null,
		internal: false,
		// Logged as api_key: the keys row's key_kind tells the two apart.
		authMethod: "api_key",
	};
	const tokenExpiresAt = verified.claims.exp * 1000;
	setBounded(tokenL1, tokenKey, {
		result,
		keyId: key.id,
		ipAllowlist: key.ip_allowlist,
		expiresAt: Math.min(tokenExpiresAt, nowMs + TOKEN_L1_TTL_MS, Number.isFinite(keyExpiresAt) ? keyExpiresAt : Infinity),
	}, TOKEN_L1_MAX_ENTRIES);

	const usageTask = shouldRecordLastUsed("keys", key.id)
		? async () => getSupabaseAdmin().from("keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id)
		: undefined;
	return { result, usageTask };
}
