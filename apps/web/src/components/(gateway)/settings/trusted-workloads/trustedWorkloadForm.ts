import type { SettingsWorkloadIdentityPolicy, SettingsWorkloadIdentityProvider } from "@/lib/fetchers/internal/settingsTypes";

// Form state for Settings → Trusted workloads, and the request body the
// gateway's /v1/workload-identity/policies routes accept. The gateway validates
// again; these checks only point at the field it would reject, and only where
// the platform's format is certain.

export const MAX_NAME_LENGTH = 100;
export const MAX_LIFETIME_HOURS = 12;
export const VERCEL_GLOBAL_ISSUER = "https://oidc.vercel.com";
export const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
export const GITLAB_ISSUER = "https://gitlab.com";
export const GOOGLE_CLOUD_ISSUER = "https://accounts.google.com";
export const BUILDKITE_ISSUER = "https://agent.buildkite.com";
export const CIRCLECI_ISSUER_PREFIX = "https://oidc.circleci.com/org/";
export const DEFAULT_CUSTOM_OWNER_CLAIM = "sub";
export const VERCEL_ENVIRONMENTS = ["production", "preview", "development"] as const;
export type VercelEnvironment = (typeof VERCEL_ENVIRONMENTS)[number];

export const WORKLOAD_PROVIDERS: readonly SettingsWorkloadIdentityProvider[] = [
	"vercel",
	"github_actions",
	"gitlab",
	"google_cloud",
	"buildkite",
	"circleci",
	"aws",
	"custom",
];

const SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const VERCEL_TEAM_ID = /^team_[A-Za-z0-9]{1,64}$/;
const VERCEL_PROJECT_ID = /^prj_[A-Za-z0-9]{1,64}$/;
const NUMERIC_ID = /^\d{1,20}$/;
const GOOGLE_UNIQUE_ID = /^\d{1,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AWS_ISSUER = /^https:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tokens\.sts\.global\.api\.aws$/;
const AWS_ROLE_ARN = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/;
// Matches the gateway's claim name rule; registered claims are checked by the verifier.
const CLAIM_NAME = /^[A-Za-z0-9._:/-]{1,128}$/;
const RESERVED_CLAIMS = new Set(["iss", "aud", "exp", "iat", "nbf", "jti"]);
const MAX_VALUE_LENGTH = 256;

export type WorkloadProblem =
	| "name"
	| "vercelTeamSlug"
	| "vercelTeamId"
	| "vercelProjectId"
	| "githubOwnerId"
	| "githubRepositoryId"
	| "gitlabProjectId"
	| "googleServiceAccountId"
	| "googleServiceAccountEmail"
	| "buildkiteOrganizationId"
	| "circleciOrganizationId"
	| "circleciProjectId"
	| "awsIssuer"
	| "awsRoleArn"
	| "customIssuer"
	| "customOwnerClaim"
	| "customOwnerId"
	| "customCondition"
	| "lifetime";

/** A single-value condition the form shows for a provider. */
type ConditionSpec = { claim: string; pattern?: RegExp; problem?: WorkloadProblem };

type ProviderSpec = {
	/** Claim the owner is pinned to; null when the workspace picks it (custom issuers). */
	ownerClaim: string | null;
	owner: { pattern: RegExp; problem: WorkloadProblem; normalise?: (value: string) => string };
	conditions: readonly ConditionSpec[];
	/** The optional condition that narrows a policy below the whole owner, if any. */
	narrowedBy?: string;
};

const PROVIDERS: Record<SettingsWorkloadIdentityProvider, ProviderSpec> = {
	vercel: {
		ownerClaim: "owner_id",
		owner: { pattern: VERCEL_TEAM_ID, problem: "vercelTeamId" },
		conditions: [{ claim: "project_id", pattern: VERCEL_PROJECT_ID, problem: "vercelProjectId" }],
		narrowedBy: "project_id",
	},
	github_actions: {
		ownerClaim: "repository_owner_id",
		owner: { pattern: NUMERIC_ID, problem: "githubOwnerId" },
		conditions: [{ claim: "repository_id", pattern: NUMERIC_ID, problem: "githubRepositoryId" }, { claim: "ref" }, { claim: "environment" }],
		narrowedBy: "repository_id",
	},
	gitlab: {
		ownerClaim: "project_id",
		owner: { pattern: NUMERIC_ID, problem: "gitlabProjectId" },
		conditions: [{ claim: "ref" }, { claim: "environment" }],
	},
	google_cloud: {
		ownerClaim: "sub",
		owner: { pattern: GOOGLE_UNIQUE_ID, problem: "googleServiceAccountId" },
		conditions: [{ claim: "email", pattern: EMAIL, problem: "googleServiceAccountEmail" }],
	},
	buildkite: {
		ownerClaim: "organization_id",
		owner: { pattern: UUID, problem: "buildkiteOrganizationId", normalise: (value) => value.toLowerCase() },
		conditions: [{ claim: "pipeline_slug" }],
		narrowedBy: "pipeline_slug",
	},
	circleci: {
		ownerClaim: "oidc.circleci.com/org-id",
		owner: { pattern: UUID, problem: "circleciOrganizationId", normalise: (value) => value.toLowerCase() },
		conditions: [{ claim: "oidc.circleci.com/project-id", pattern: UUID, problem: "circleciProjectId" }],
		narrowedBy: "oidc.circleci.com/project-id",
	},
	aws: {
		ownerClaim: "sub",
		owner: { pattern: AWS_ROLE_ARN, problem: "awsRoleArn" },
		conditions: [],
	},
	custom: {
		ownerClaim: null,
		owner: { pattern: /^\S(?:.{0,254}\S)?$/, problem: "customOwnerId" },
		conditions: [],
	},
};

/** Claims the form shows as single-value text conditions for a provider. */
export function conditionClaims(provider: SettingsWorkloadIdentityProvider): string[] {
	return PROVIDERS[provider].conditions.map((condition) => condition.claim);
}

export type WorkloadDraft = {
	name: string;
	provider: SettingsWorkloadIdentityProvider;
	/** Vercel team slug (empty for the global issuer), or the issuer URL for AWS and custom issuers. */
	issuer: string;
	/** Custom issuers only: the claim the owner value is matched against. */
	ownerClaim: string;
	/** The pinned owner: team, owner, project, service account, organisation or role. */
	ownerId: string;
	/** Single-value conditions the form shows, by claim name. */
	conditions: Record<string, string>;
	vercelEnvironments: VercelEnvironment[];
	/** Custom issuers only: one optional extra claim and value. */
	customClaim: string;
	customValue: string;
	maxLifetimeHours: string;
	/** Conditions on claims the form does not show, kept on save. */
	extraConditions: Record<string, string[]>;
	/**
	 * The saved policy when editing. The form shows one value per claim and whole
	 * hours, so an unchanged field keeps the saved values exactly.
	 */
	original?: { conditions: Record<string, string[]>; lifetimeSeconds: number; lifetimeHours: string };
};

export type WorkloadCreatePayload = {
	name: string;
	provider: SettingsWorkloadIdentityProvider;
	issuer: string;
	/** Sent for custom issuers only; presets have a fixed owner claim. */
	owner_claim?: string;
	owner_id: string;
	claim_conditions: Record<string, string[]>;
	max_token_lifetime_seconds: number;
};
/** Provider, issuer and owner identify what is trusted and cannot change. */
export type WorkloadUpdatePayload = Omit<WorkloadCreatePayload, "provider" | "issuer" | "owner_claim" | "owner_id">;

export function emptyWorkloadDraft(provider: SettingsWorkloadIdentityProvider = "vercel"): WorkloadDraft {
	return {
		name: "",
		provider,
		issuer: "",
		ownerClaim: provider === "custom" ? DEFAULT_CUSTOM_OWNER_CLAIM : "",
		ownerId: "",
		conditions: {},
		vercelEnvironments: provider === "vercel" ? ["production"] : [],
		customClaim: "",
		customValue: "",
		maxLifetimeHours: String(MAX_LIFETIME_HOURS),
		extraConditions: {},
	};
}

export function vercelTeamSlug(issuer: string): string {
	return issuer.startsWith(`${VERCEL_GLOBAL_ISSUER}/`) ? issuer.slice(VERCEL_GLOBAL_ISSUER.length + 1) : "";
}

/** The claim a saved policy pins its owner to. */
export function policyOwnerClaim(policy: Pick<SettingsWorkloadIdentityPolicy, "provider" | "ownerClaim">): string {
	return PROVIDERS[policy.provider].ownerClaim ?? policy.ownerClaim ?? DEFAULT_CUSTOM_OWNER_CLAIM;
}

export function draftFromPolicy(policy: SettingsWorkloadIdentityPolicy): WorkloadDraft {
	const conditions = policy.claimConditions ?? {};
	const shown = new Set<string>(conditionClaims(policy.provider));
	if (policy.provider === "vercel") shown.add("environment");
	// A custom policy shows its first condition in the extra claim fields.
	const customEntry = policy.provider === "custom" ? Object.entries(conditions).find(([, values]) => values?.length) : undefined;
	if (customEntry) shown.add(customEntry[0]);
	const extraConditions = Object.fromEntries(Object.entries(conditions).filter(([claim]) => !shown.has(claim)));
	const lifetimeHours = String(Math.max(1, Math.round(policy.maxTokenLifetimeSeconds / 3600)));
	const environments = (conditions.environment ?? []).filter((value): value is VercelEnvironment =>
		(VERCEL_ENVIRONMENTS as readonly string[]).includes(value));
	const issuer = policy.provider === "vercel" ? vercelTeamSlug(policy.issuer)
		: policy.provider === "aws" || policy.provider === "custom" ? policy.issuer
		: "";
	return {
		...emptyWorkloadDraft(policy.provider),
		name: policy.name,
		issuer,
		ownerClaim: policy.provider === "custom" ? policyOwnerClaim(policy) : "",
		ownerId: policy.ownerId,
		conditions: Object.fromEntries(conditionClaims(policy.provider).map((claim) => [claim, conditions[claim]?.[0] ?? ""])),
		vercelEnvironments: policy.provider === "vercel" ? environments : [],
		customClaim: customEntry?.[0] ?? "",
		customValue: customEntry?.[1][0] ?? "",
		maxLifetimeHours: lifetimeHours,
		extraConditions,
		original: { conditions, lifetimeSeconds: policy.maxTokenLifetimeSeconds, lifetimeHours },
	};
}

type Built = { ok: true; payload: WorkloadCreatePayload } | { ok: false; problem: WorkloadProblem };

/** The saved values when the field still shows what was loaded, else the edited ones. */
function keepUnchanged(original: string[] | undefined, shown: string[], edited: string[]): string[] {
	const same = original !== undefined && shown.length === edited.length && shown.every((value, index) => value === edited[index]);
	return same ? original : edited;
}

/** A public https issuer in the exact form tokens carry; the gateway checks the rest. */
function isHttpsIssuer(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
		return url.hostname.includes(".") && (url.href === value || url.href === `${value}/`);
	} catch {
		return false;
	}
}

function isClaimName(value: string): boolean {
	return CLAIM_NAME.test(value) && !RESERVED_CLAIMS.has(value);
}

type IssuerResult = { ok: true; issuer: string } | { ok: false; problem: WorkloadProblem };

function buildIssuer(draft: WorkloadDraft, ownerId: string): IssuerResult {
	const value = draft.issuer.trim();
	switch (draft.provider) {
		case "vercel": {
			const slug = value.toLowerCase();
			if (slug && !SLUG.test(slug)) return { ok: false, problem: "vercelTeamSlug" };
			return { ok: true, issuer: slug ? `${VERCEL_GLOBAL_ISSUER}/${slug}` : VERCEL_GLOBAL_ISSUER };
		}
		case "github_actions":
			return { ok: true, issuer: GITHUB_ACTIONS_ISSUER };
		case "gitlab":
			return { ok: true, issuer: GITLAB_ISSUER };
		case "google_cloud":
			return { ok: true, issuer: GOOGLE_CLOUD_ISSUER };
		case "buildkite":
			return { ok: true, issuer: BUILDKITE_ISSUER };
		// Each CircleCI organisation has its own issuer.
		case "circleci":
			return { ok: true, issuer: `${CIRCLECI_ISSUER_PREFIX}${ownerId}` };
		case "aws":
			return AWS_ISSUER.test(value) ? { ok: true, issuer: value } : { ok: false, problem: "awsIssuer" };
		case "custom":
			return isHttpsIssuer(value) ? { ok: true, issuer: value } : { ok: false, problem: "customIssuer" };
	}
}

export function draftToPayload(draft: WorkloadDraft): Built {
	const spec = PROVIDERS[draft.provider];
	const name = draft.name.trim();
	if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, problem: "name" };

	let ownerClaim: string | undefined;
	if (draft.provider === "custom") {
		const claim = draft.ownerClaim.trim();
		if (!isClaimName(claim)) return { ok: false, problem: "customOwnerClaim" };
		ownerClaim = claim;
	}
	const ownerText = draft.ownerId.trim();
	const ownerId = spec.owner.normalise ? spec.owner.normalise(ownerText) : ownerText;
	// Check fields in screen order; a CircleCI issuer is built from the organisation ID.
	const ownerOk = spec.owner.pattern.test(ownerId);
	if (!ownerOk && draft.provider === "circleci") return { ok: false, problem: spec.owner.problem };
	const built = buildIssuer(draft, ownerId);
	if (!built.ok) return built;
	if (!ownerOk) return { ok: false, problem: spec.owner.problem };

	const saved = draft.original?.conditions;
	const shownFirst = (claim: string) => (saved?.[claim]?.length ? [saved[claim][0]] : []);
	// Sets a form claim, keeping the saved value list when the field was not edited.
	const setClaim = (conditions: Record<string, string[]>, claim: string, edited: string[], shown: string[]) => {
		const values = keepUnchanged(saved?.[claim], shown, edited);
		if (values.length) conditions[claim] = [...values];
	};
	const conditions: Record<string, string[]> = { ...draft.extraConditions };

	for (const condition of spec.conditions) {
		const value = (draft.conditions[condition.claim] ?? "").trim();
		if (value && condition.pattern && condition.problem && !condition.pattern.test(value)) return { ok: false, problem: condition.problem };
		setClaim(conditions, condition.claim, value ? [value] : [], shownFirst(condition.claim));
	}

	if (draft.provider === "vercel") {
		// Keep the environments in a stable order. Custom environments the form can't show are kept while the boxes are unchanged.
		const environments = VERCEL_ENVIRONMENTS.filter((environment) => draft.vercelEnvironments.includes(environment));
		const shownEnvironments = VERCEL_ENVIRONMENTS.filter((environment) => (saved?.environment ?? []).includes(environment));
		setClaim(conditions, "environment", [...environments], [...shownEnvironments]);
	}

	if (draft.provider === "custom") {
		const claim = draft.customClaim.trim();
		const value = draft.customValue.trim();
		if (claim || value) {
			if (!isClaimName(claim) || claim === ownerClaim || !value || value.length > MAX_VALUE_LENGTH) return { ok: false, problem: "customCondition" };
			setClaim(conditions, claim, [value], shownFirst(claim));
		}
	}

	const hoursText = draft.maxLifetimeHours.trim();
	const hours = Number(hoursText);
	const lifetimeUnchanged = draft.original !== undefined && hoursText === draft.original.lifetimeHours;
	if (!lifetimeUnchanged && (!Number.isInteger(hours) || hours < 1 || hours > MAX_LIFETIME_HOURS)) return { ok: false, problem: "lifetime" };

	return {
		ok: true,
		payload: {
			name,
			provider: draft.provider,
			issuer: built.issuer,
			...(ownerClaim ? { owner_claim: ownerClaim } : {}),
			owner_id: ownerId,
			claim_conditions: conditions,
			max_token_lifetime_seconds: lifetimeUnchanged && draft.original ? draft.original.lifetimeSeconds : hours * 3600,
		},
	};
}

export function toUpdatePayload(payload: WorkloadCreatePayload): WorkloadUpdatePayload {
	const { provider: _provider, issuer: _issuer, owner_claim: _claim, owner_id: _owner, ...update } = payload;
	return update;
}

/** True when a policy trusts everything its owner has (every project, repository or pipeline). */
export function isOwnerWide(policy: Pick<SettingsWorkloadIdentityPolicy, "provider" | "claimConditions">): boolean {
	const claim = PROVIDERS[policy.provider]?.narrowedBy;
	return Boolean(claim) && !policy.claimConditions?.[claim as string]?.length;
}

/** How a workload on each platform gets a token for the audience. */
export function tokenSnippet(provider: SettingsWorkloadIdentityProvider, audience: string): string {
	switch (provider) {
		case "vercel":
			return `import { getVercelOidcToken } from "@vercel/oidc";

const token = await getVercelOidcToken({ audience: "${audience}" });
// Authorization: Bearer <token>`;
		case "github_actions":
			return `permissions:
  id-token: write

steps:
  - uses: actions/github-script@v7
    with:
      script: |
        const token = await core.getIDToken("${audience}");
        // Authorization: Bearer <token>`;
		case "gitlab":
			return `job:
  id_tokens:
    PHASEO_TOKEN:
      aud: ${audience}
  script:
    - 'curl -H "Authorization: Bearer $PHASEO_TOKEN" ${audience}/v1/models'`;
		case "google_cloud":
			return `TOKEN=$(curl -s -H "Metadata-Flavor: Google" \\
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${audience}")
# Authorization: Bearer $TOKEN`;
		case "buildkite":
			return `TOKEN=$(buildkite-agent oidc request-token --audience ${audience})
# Authorization: Bearer $TOKEN`;
		case "circleci":
			return `TOKEN=$(circleci run oidc get --claims '{"aud":"${audience}"}')
# Authorization: Bearer $TOKEN`;
		case "aws":
			return `# Once per account: aws iam enable-outbound-web-identity-federation
TOKEN=$(aws sts get-web-identity-token --audience ${audience} \\
  --signing-algorithm ES384 --query WebIdentityToken --output text)
# Authorization: Bearer $TOKEN`;
		case "custom":
			return `# Kubernetes: mount a service account token for the audience
spec:
  containers:
    - name: app
      volumeMounts:
        - name: phaseo-token
          mountPath: /var/run/secrets/phaseo
  volumes:
    - name: phaseo-token
      projected:
        sources:
          - serviceAccountToken:
              audience: ${audience}
              path: token
# Authorization: Bearer <contents of /var/run/secrets/phaseo/token>`;
	}
}
