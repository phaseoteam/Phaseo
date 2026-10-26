// Purpose: Trust policies that map a verified workload token to a workspace key.
// Why: A verified signature only proves who issued the token; the policy
// decides which workloads a workspace trusts and which key they act as.
// How: Validate policies on write (pinned immutable IDs), then
// require exactly one active policy to match each token.

import { presetProviderForIssuer, type WorkloadIdentityProvider } from "./issuers";
import { DEFAULT_MAX_TOKEN_LIFETIME_SECONDS, WORKLOAD_IDENTITY_AUDIENCE, type WorkloadTokenClaims } from "./verify";

export type WorkloadIdentityPolicy = {
	id: string;
	workspaceId: string;
	keyId: string;
	provider: WorkloadIdentityProvider;
	issuer: string;
	/** Every listed claim must equal one of its values. */
	claimConditions: Record<string, string[]>;
	maxTokenLifetimeSeconds: number;
	status: "active" | "disabled";
};

export type WorkloadIdentityPolicyInput = Pick<WorkloadIdentityPolicy, "provider" | "issuer" | "claimConditions"> & {
	maxTokenLifetimeSeconds?: number;
};

/**
 * Immutable identifiers a policy must pin. Names such as `owner` or
 * `repository` can be renamed or re-registered by someone else.
 */
export const REQUIRED_PINNED_CLAIMS: Record<WorkloadIdentityProvider, readonly string[]> = {
	vercel: ["owner_id"],
	github_actions: ["repository_owner_id"],
};

// Registered claims are checked by the verifier.
const RESERVED_CLAIMS = new Set(["iss", "aud", "exp", "iat", "nbf", "jti"]);
const CLAIM_NAME = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_CONDITIONS = 16;
const MAX_VALUES_PER_CLAIM = 20;
const MAX_VALUE_LENGTH = 256;
const MIN_LIFETIME_SECONDS = 60;

export function validateWorkloadIdentityPolicy(
	input: WorkloadIdentityPolicyInput,
): { ok: true; value: WorkloadIdentityPolicyInput & { maxTokenLifetimeSeconds: number } } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	const issuer = String(input.issuer ?? "");

	if (input.provider === "vercel" || input.provider === "github_actions") {
		if (presetProviderForIssuer(issuer) !== input.provider) errors.push(`issuer is not a ${input.provider} issuer`);
	} else {
		errors.push("provider must be vercel or github_actions");
	}

	const conditions = input.claimConditions && typeof input.claimConditions === "object" ? input.claimConditions : {};
	const entries = Object.entries(conditions);
	if (entries.length > MAX_CONDITIONS) errors.push(`at most ${MAX_CONDITIONS} claim conditions`);
	for (const [claim, values] of entries) {
		if (!CLAIM_NAME.test(claim)) errors.push(`claim name "${claim}" is invalid`);
		else if (RESERVED_CLAIMS.has(claim)) errors.push(`claim "${claim}" cannot be a condition`);
		if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES_PER_CLAIM) {
			errors.push(`claim "${claim}" needs 1 to ${MAX_VALUES_PER_CLAIM} values`);
			continue;
		}
		if (values.some((value) => typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_LENGTH || value !== value.trim())) {
			errors.push(`claim "${claim}" values must be non-empty trimmed strings`);
		}
	}
	const pinned = REQUIRED_PINNED_CLAIMS[input.provider] ?? [];
	for (const claim of pinned) {
		if (!Array.isArray(conditions[claim]) || conditions[claim].length === 0) {
			errors.push(`claim "${claim}" is required for ${input.provider} policies`);
		}
	}

	const lifetime = input.maxTokenLifetimeSeconds ?? DEFAULT_MAX_TOKEN_LIFETIME_SECONDS;
	if (!Number.isInteger(lifetime) || lifetime < MIN_LIFETIME_SECONDS || lifetime > DEFAULT_MAX_TOKEN_LIFETIME_SECONDS) {
		errors.push(`maxTokenLifetimeSeconds must be an integer from ${MIN_LIFETIME_SECONDS} to ${DEFAULT_MAX_TOKEN_LIFETIME_SECONDS}`);
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, value: { ...input, issuer, claimConditions: conditions, maxTokenLifetimeSeconds: lifetime } };
}

function claimAsString(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "boolean") return String(value);
	return null;
}

function tokenLifetimeSeconds(claims: WorkloadTokenClaims): number {
	const notBefore = typeof claims.nbf === "number" ? claims.nbf : claims.iat;
	return claims.exp - notBefore;
}

export function policyMatchesClaims(policy: WorkloadIdentityPolicy, claims: WorkloadTokenClaims): boolean {
	if (policy.status !== "active" || policy.issuer !== claims.iss) return false;
	const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (!audiences.some((value) => value === WORKLOAD_IDENTITY_AUDIENCE)) return false;
	if (tokenLifetimeSeconds(claims) > policy.maxTokenLifetimeSeconds) return false;
	// Defence in depth: a stored policy that lost its pinned claim never matches.
	for (const claim of REQUIRED_PINNED_CLAIMS[policy.provider] ?? []) {
		if (!policy.claimConditions[claim]?.length) return false;
	}
	for (const [claim, allowed] of Object.entries(policy.claimConditions)) {
		const actual = claimAsString(claims[claim]);
		if (actual === null || !allowed.includes(actual)) return false;
	}
	return true;
}

export type PolicyMatchResult =
	| { ok: true; policy: WorkloadIdentityPolicy }
	| { ok: false; reason: "workload_identity_no_matching_policy" | "workload_identity_ambiguous" };

/**
 * Exactly one policy must match. `workspaceId` narrows the candidates when
 * the caller names a workspace (for example the same repository trusted by
 * two workspaces).
 */
export function matchWorkloadIdentityPolicy(
	claims: WorkloadTokenClaims,
	policies: WorkloadIdentityPolicy[],
	options: { workspaceId?: string | null } = {},
): PolicyMatchResult {
	const matches = policies.filter((policy) =>
		(!options.workspaceId || policy.workspaceId === options.workspaceId) && policyMatchesClaims(policy, claims));
	if (matches.length === 0) return { ok: false, reason: "workload_identity_no_matching_policy" };
	if (matches.length > 1) return { ok: false, reason: "workload_identity_ambiguous" };
	return { ok: true, policy: matches[0] };
}
