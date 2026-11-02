// Purpose: Trust policies that map a verified workload token to a workspace key.
// Why: A verified signature only proves who issued the token; the policy
// decides which workloads a workspace trusts and which key they act as.
// How: Validate policies on write (pinned immutable IDs), then
// require exactly one active policy to match each token.

import { isCustomIssuer, isWorkloadIdentityProvider, WORKLOAD_IDENTITY_PROVIDERS, presetProviderForIssuer, type PresetWorkloadIdentityProvider, type WorkloadIdentityProvider } from "./issuers";
import { DEFAULT_MAX_TOKEN_LIFETIME_SECONDS, WORKLOAD_IDENTITY_AUDIENCE, type WorkloadTokenClaims } from "./verify";

export type WorkloadIdentityPolicy = {
	id: string;
	workspaceId: string;
	keyId: string;
	provider: WorkloadIdentityProvider;
	issuer: string;
	/** Claim the owner is pinned to; only custom issuers choose it. */
	pinnedClaim?: string | null;
	/** Every listed claim must equal one of its values. */
	claimConditions: Record<string, string[]>;
	maxTokenLifetimeSeconds: number;
	status: "active" | "disabled";
};

export type WorkloadIdentityPolicyInput = Pick<WorkloadIdentityPolicy, "provider" | "issuer" | "claimConditions" | "pinnedClaim"> & {
	maxTokenLifetimeSeconds?: number;
};

/**
 * Immutable identifiers a policy must pin. Names such as `owner` or
 * `repository` can be renamed or re-registered by someone else.
 */
export const REQUIRED_PINNED_CLAIMS: Record<PresetWorkloadIdentityProvider, readonly string[]> = {
	vercel: ["owner_id"],
	github_actions: ["repository_owner_id"],
	// Projects move between groups, so namespace_id is not stable; project_id is.
	gitlab: ["project_id"],
	// The service account's unique numeric ID; its email can be re-created by anyone in the project.
	google_cloud: ["sub"],
	buildkite: ["organization_id"],
	circleci: ["oidc.circleci.com/org-id"],
	// The role ARN; the issuer already identifies the account.
	aws: ["sub"],
};

/**
 * The claim a policy pins its owner to: fixed per preset, chosen by the
 * workspace for a custom issuer (whose host it controls).
 */
export function pinnedClaimFor(provider: WorkloadIdentityProvider, pinnedClaim?: string | null): string | null {
	if (provider === "custom") return pinnedClaim || null;
	return REQUIRED_PINNED_CLAIMS[provider]?.[0] ?? null;
}

// Registered claims are checked by the verifier.
const RESERVED_CLAIMS = new Set(["iss", "aud", "exp", "iat", "nbf", "jti"]);
// Slashes and colons appear in platform claims such as `oidc.circleci.com/org-id`.
export const CLAIM_NAME = /^[A-Za-z0-9._:/-]{1,128}$/;
const MAX_CONDITIONS = 16;
const MAX_VALUES_PER_CLAIM = 20;
const MAX_VALUE_LENGTH = 256;
const MIN_LIFETIME_SECONDS = 60;
const WORKLOAD_IDENTITY_PROVIDER_LIST = WORKLOAD_IDENTITY_PROVIDERS.join(", ");

export function validateWorkloadIdentityPolicy(
	input: WorkloadIdentityPolicyInput,
): { ok: true; value: WorkloadIdentityPolicyInput & { maxTokenLifetimeSeconds: number } } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	const issuer = String(input.issuer ?? "");

	if (!isWorkloadIdentityProvider(input.provider)) {
		errors.push(`provider must be one of ${WORKLOAD_IDENTITY_PROVIDER_LIST}`);
	} else if (input.provider === "custom") {
		if (!isCustomIssuer(issuer)) errors.push("issuer must be a public https URL on a host that is not a preset platform's");
		const pinnedClaim = input.pinnedClaim ?? "";
		if (!CLAIM_NAME.test(pinnedClaim) || RESERVED_CLAIMS.has(pinnedClaim)) errors.push("owner_claim must be a claim name such as sub");
	} else if (presetProviderForIssuer(issuer) !== input.provider) {
		errors.push(`issuer is not a ${input.provider} issuer`);
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
	const pinned = isWorkloadIdentityProvider(input.provider) ? pinnedClaimFor(input.provider, input.pinnedClaim) : null;
	if (pinned && CLAIM_NAME.test(pinned) && (!Array.isArray(conditions[pinned]) || conditions[pinned].length === 0)) {
		errors.push(`claim "${pinned}" is required for ${input.provider} policies`);
	}
	// A CircleCI issuer belongs to one organization; its pinned org must be that one.
	if (input.provider === "circleci" && pinned && Array.isArray(conditions[pinned])) {
		const orgId = issuer.slice(issuer.lastIndexOf("/") + 1);
		if (conditions[pinned].some((value) => value !== orgId)) errors.push(`claim "${pinned}" must be the organization ID in the issuer`);
	}

	const lifetime = input.maxTokenLifetimeSeconds ?? DEFAULT_MAX_TOKEN_LIFETIME_SECONDS;
	if (!Number.isInteger(lifetime) || lifetime < MIN_LIFETIME_SECONDS || lifetime > DEFAULT_MAX_TOKEN_LIFETIME_SECONDS) {
		errors.push(`maxTokenLifetimeSeconds must be an integer from ${MIN_LIFETIME_SECONDS} to ${DEFAULT_MAX_TOKEN_LIFETIME_SECONDS}`);
	}

	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		value: {
			...input,
			issuer,
			pinnedClaim: input.provider === "custom" ? input.pinnedClaim : null,
			claimConditions: conditions,
			maxTokenLifetimeSeconds: lifetime,
		},
	};
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
	const pinned = pinnedClaimFor(policy.provider, policy.pinnedClaim);
	if (!pinned || !policy.claimConditions[pinned]?.length) return false;
	for (const [claim, allowed] of Object.entries(policy.claimConditions)) {
		const actual = claimAsString(claims[claim]);
		if (actual === null || !allowed.includes(actual)) return false;
	}
	return true;
}

export type PolicyMatchResult =
	| { ok: true; policy: WorkloadIdentityPolicy }
	| { ok: false; reason: "workload_identity_no_matching_policy" | "workload_identity_ambiguous" };

export const WORKLOAD_IDENTITY_AMBIGUOUS_MESSAGE =
	"This token matches more than one trust policy. If they are in different workspaces, send the x-phaseo-workspace header with the workspace ID to choose one. If they are in the same workspace, narrow their conditions so only one matches.";

/**
 * Every active policy the token satisfies. `workspaceId` narrows the
 * candidates when the caller names a workspace (for example the same
 * repository trusted by two workspaces).
 */
export function matchingWorkloadIdentityPolicies<P extends WorkloadIdentityPolicy>(
	claims: WorkloadTokenClaims,
	policies: P[],
	options: { workspaceId?: string | null } = {},
): P[] {
	return policies.filter((policy) =>
		(!options.workspaceId || policy.workspaceId === options.workspaceId) && policyMatchesClaims(policy, claims));
}

/**
 * Exactly one policy must match. Never pick between several matches (oldest,
 * first creator, ...): owner IDs are public, so any rule would let another
 * workspace receive or block a caller's traffic. The caller names the
 * workspace with `workspaceId` instead.
 */
export function matchWorkloadIdentityPolicy(
	claims: WorkloadTokenClaims,
	policies: WorkloadIdentityPolicy[],
	options: { workspaceId?: string | null } = {},
): PolicyMatchResult {
	return resolveWorkloadIdentityMatches(matchingWorkloadIdentityPolicies(claims, policies, options));
}

export function resolveWorkloadIdentityMatches(matches: WorkloadIdentityPolicy[]): PolicyMatchResult {
	if (matches.length === 0) return { ok: false, reason: "workload_identity_no_matching_policy" };
	if (matches.length > 1) return { ok: false, reason: "workload_identity_ambiguous" };
	return { ok: true, policy: matches[0] };
}
