// Purpose: Authenticate gateway requests that carry a workload OIDC token
// (Vercel, GitHub Actions, GitLab, Google Cloud, Buildkite, CircleCI, AWS, or a
// workspace's own issuer such as a Kubernetes cluster).
// Why: Lets a workspace trust its own deployments and CI jobs instead of storing a
// long-lived API key there.
// How: Verify the token, match it to exactly one active trust policy, then act as
// that policy's secretless key so limits, budgets, logs and billing are unchanged.

import { getSupabaseAdmin, type GatewayBindings } from "@/runtime/env";
import { isWorkloadIdentityAccessEnabled } from "@/core/feature-flags";
import { shouldRecordLastUsed } from "@/core/last-used-throttle";
import { isKeyIpAllowed } from "@/lib/security/keyIpAllowlist";
import { providerForIssuer, type WorkloadIdentityProvider } from "@/lib/workload-identity/issuers";
import {
	matchingWorkloadIdentityPolicies,
	pinnedClaimFor,
	resolveWorkloadIdentityMatches,
	WORKLOAD_IDENTITY_AMBIGUOUS_MESSAGE,
	type WorkloadIdentityPolicy,
} from "@/lib/workload-identity/policy";
import { createJwksSource, readUnverifiedIssuer, verifyWorkloadToken, type JwksSource } from "@/lib/workload-identity/verify";
import type { AuthFailure, AuthSuccess } from "./auth";

// Policy and verified-token caches share the key cache's revocation window.
const POLICY_L1_TTL_MS = 30_000;
const POLICY_L1_MAX_ENTRIES = 1_000;
const TOKEN_L1_TTL_MS = 30_000;
const TOKEN_L1_MAX_ENTRIES = 5_000;
// New policies' issuers are picked up within this window.
const ISSUERS_L1_TTL_MS = 60_000;
// Owner values per policy query; the 8 KB token cap bounds how many there are in total.
const OWNER_IDS_PER_QUERY = 50;
const MAX_OWNER_ID_LENGTH = 256;
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
	pinned_claim: string | null;
	pinned_owner_id: string;
	claim_conditions: Record<string, string[]> | null;
	max_token_lifetime_seconds: number;
	status: "active" | "disabled";
	keys: PolicyKeyRow | null;
};

type CandidatePolicy = WorkloadIdentityPolicy & { key: PolicyKeyRow };

const policyL1 = new Map<string, { policies: CandidatePolicy[]; expiresAt: number }>();
const tokenL1 = new Map<string, { result: AuthSuccess; keyId: string; ipAllowlist: unknown; expiresAt: number }>();

let issuersL1: { issuers: ReadonlySet<string>; expiresAt: number } | null = null;
let issuersInFlight: Promise<ReadonlySet<string> | "db_error"> | null = null;

export function __resetWorkloadIdentityAuthCachesForTests(): void {
	policyL1.clear();
	tokenL1.clear();
	issuersL1 = null;
	issuersInFlight = null;
}

export function isWorkloadIdentityAuthEnabled(bindings: Pick<GatewayBindings, "WORKLOAD_IDENTITY_AUTH_ENABLED">): boolean {
	return bindings.WORKLOAD_IDENTITY_AUTH_ENABLED !== "false";
}

/**
 * Cheap routing check: an unverified `iss` naming a preset platform or a
 * possible custom issuer. Whether a custom issuer is trusted is decided later,
 * against the configured issuers.
 */
export function isWorkloadIdentityToken(token: string): boolean {
	const issuer = readUnverifiedIssuer(token);
	return issuer !== null && providerForIssuer(issuer) !== null;
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
	const pinnedClaim = pinnedClaimFor(row.provider, row.pinned_claim);
	if (!pinnedClaim) return null;
	// The pinned owner is stored in its own indexed column. A computed key keeps
	// it an own property whatever its name.
	const conditions = { ...(row.claim_conditions ?? {}), [pinnedClaim]: [row.pinned_owner_id] };
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		keyId: row.key_id,
		provider: row.provider,
		issuer: row.issuer,
		pinnedClaim: row.pinned_claim,
		claimConditions: conditions,
		maxTokenLifetimeSeconds: row.max_token_lifetime_seconds,
		status: row.status,
		key: row.keys,
	};
}

/** One small read per isolate per minute, whatever the traffic. */
async function loadConfiguredIssuers(nowMs: number): Promise<ReadonlySet<string> | "db_error"> {
	if (issuersL1 && issuersL1.expiresAt > nowMs) return issuersL1.issuers;
	issuersInFlight ??= (async () => {
		try {
			const { data, error } = await getSupabaseAdmin().rpc("active_workload_identity_issuers");
			if (error) return "db_error" as const;
			const issuers = new Set(Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : []);
			issuersL1 = { issuers, expiresAt: Date.now() + ISSUERS_L1_TTL_MS };
			return issuers;
		} finally {
			issuersInFlight = null;
		}
	})();
	return issuersInFlight;
}

/**
 * Policies are found by issuer and pinned owner. A preset pins one known
 * claim; each custom-issuer policy chooses its own, so every top-level claim
 * value of the token is a possible owner and the policy's own pinned claim is
 * checked when matching.
 */
async function loadCandidatePolicies(issuer: string, ownerIds: string[]): Promise<CandidatePolicy[] | "db_error"> {
	const cacheKey = JSON.stringify([issuer, ownerIds]);
	const cached = policyL1.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.policies;
	// Chunked so a custom-issuer token with many claims keeps each request URL small.
	const chunks: string[][] = [];
	for (let start = 0; start < ownerIds.length; start += OWNER_IDS_PER_QUERY) chunks.push(ownerIds.slice(start, start + OWNER_IDS_PER_QUERY));
	const results = await Promise.all(chunks.map((chunk) => getSupabaseAdmin()
		.from("workload_identity_policies")
		.select("id,workspace_id,key_id,provider,issuer,pinned_claim,pinned_owner_id,claim_conditions,max_token_lifetime_seconds,status,keys(id,kid,workspace_id,status,key_kind,expires_at,ip_allowlist,created_by)")
		.eq("issuer", issuer)
		.eq("status", "active")
		.in("pinned_owner_id", chunk)));
	if (results.some((result) => result.error)) return "db_error";
	const policies = results.flatMap((result) => (result.data ?? []) as unknown as PolicyRow[])
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

/** Owner values to look policies up by: the preset's pinned claim, or any claim value for a custom issuer. */
function possibleOwnerIds(provider: WorkloadIdentityProvider, claims: Record<string, unknown>): string[] {
	if (provider !== "custom") {
		const pinnedClaim = pinnedClaimFor(provider);
		const ownerId = pinnedClaim ? claimAsString(claims[pinnedClaim]) : null;
		return ownerId ? [ownerId] : [];
	}
	const values = new Set<string>();
	for (const value of Object.values(claims)) {
		const ownerId = claimAsString(value);
		// pinned_owner_id is at most 256 characters, so longer values cannot match.
		if (ownerId && ownerId.length <= MAX_OWNER_ID_LENGTH) values.add(ownerId);
	}
	return [...values].sort();
}

function isGateOpen(auth: AuthSuccess): Promise<boolean> {
	return isWorkloadIdentityAccessEnabled({
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
	});
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
		// Rollout changes apply to cached tokens too; the gate keeps its own short cache.
		if (!(await isGateOpen(cached.result))) return { result: { ok: false, reason: "workload_identity_not_enabled" } };
		return { result: cached.result };
	}

	const configuredIssuers = await loadConfiguredIssuers(nowMs);
	if (configuredIssuers === "db_error") return { result: { ok: false, reason: "db_error" } };
	const verified = await verifyWorkloadToken(token, {
		jwks: deps.jwks ?? createJwksSource({ kv: deps.kv ?? null }),
		configuredIssuers,
		nowSeconds: Math.floor(nowMs / 1000),
	});
	if (verified.ok === false) return { result: { ok: false, reason: verified.reason } };

	const ownerIds = possibleOwnerIds(verified.provider, verified.claims);
	if (ownerIds.length === 0) return { result: { ok: false, reason: "workload_identity_no_matching_policy" } };

	const policies = await loadCandidatePolicies(verified.claims.iss, ownerIds);
	if (policies === "db_error") return { result: { ok: false, reason: "db_error" } };
	// Owner IDs are public, so another workspace can pin someone else's and make
	// their token ambiguous. Never resolve that by dropping or ranking candidates
	// (rollout state, age, creator): any such rule can route a caller's requests,
	// and their prompts, into the other workspace. The caller names the workspace
	// with the header instead, and the error says how.
	const match = resolveWorkloadIdentityMatches(
		matchingWorkloadIdentityPolicies(verified.claims, policies, { workspaceId: workspaceHint }),
	);
	if (match.ok === false) {
		return {
			result: match.reason === "workload_identity_ambiguous"
				? { ok: false, reason: match.reason, message: WORKLOAD_IDENTITY_AMBIGUOUS_MESSAGE }
				: { ok: false, reason: match.reason },
		};
	}

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
	// Checked only after a signed token matched a policy, so other traffic never waits on Statsig.
	if (!(await isGateOpen(result))) return { result: { ok: false, reason: "workload_identity_not_enabled" } };
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
