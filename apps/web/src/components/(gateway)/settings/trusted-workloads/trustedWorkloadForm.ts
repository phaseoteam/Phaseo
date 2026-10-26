import type { SettingsWorkloadIdentityPolicy, SettingsWorkloadIdentityProvider } from "@/lib/fetchers/internal/settingsTypes";

// Form state for Settings → Trusted workloads, and the request body the
// gateway's /v1/workload-identity/policies routes accept. The gateway validates
// again; these checks only point at the field it would reject.

export const MAX_NAME_LENGTH = 100;
export const MAX_LIFETIME_HOURS = 12;
export const VERCEL_GLOBAL_ISSUER = "https://oidc.vercel.com";
export const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
export const VERCEL_ENVIRONMENTS = ["production", "preview", "development"] as const;
export type VercelEnvironment = (typeof VERCEL_ENVIRONMENTS)[number];

// Claims the form edits directly; any others set through the API are kept as they are.
const FORM_CLAIMS: Record<SettingsWorkloadIdentityProvider, readonly string[]> = {
	vercel: ["project_id", "environment"],
	github_actions: ["repository_id", "ref", "environment"],
};

const SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const VERCEL_TEAM_ID = /^team_[A-Za-z0-9]{1,64}$/;
const VERCEL_PROJECT_ID = /^prj_[A-Za-z0-9]{1,64}$/;
const NUMERIC_ID = /^\d{1,20}$/;

export type WorkloadDraft = {
	name: string;
	provider: SettingsWorkloadIdentityProvider;
	/** Vercel team slug for the team issuer; empty for the global issuer. */
	vercelTeamSlug: string;
	ownerId: string;
	vercelProjectId: string;
	vercelEnvironments: VercelEnvironment[];
	githubRepositoryId: string;
	githubRef: string;
	githubEnvironment: string;
	maxLifetimeHours: string;
	/** Conditions on claims the form does not show, kept on save. */
	extraConditions: Record<string, string[]>;
};

export type WorkloadProblem =
	| "name"
	| "vercelTeamSlug"
	| "vercelTeamId"
	| "vercelProjectId"
	| "githubOwnerId"
	| "githubRepositoryId"
	| "lifetime";

export type WorkloadCreatePayload = {
	name: string;
	provider: SettingsWorkloadIdentityProvider;
	issuer: string;
	owner_id: string;
	claim_conditions: Record<string, string[]>;
	max_token_lifetime_seconds: number;
};
/** Provider, issuer and owner identify what is trusted and cannot change. */
export type WorkloadUpdatePayload = Omit<WorkloadCreatePayload, "provider" | "issuer" | "owner_id">;

export function emptyWorkloadDraft(provider: SettingsWorkloadIdentityProvider = "vercel"): WorkloadDraft {
	return {
		name: "",
		provider,
		vercelTeamSlug: "",
		ownerId: "",
		vercelProjectId: "",
		vercelEnvironments: ["production"],
		githubRepositoryId: "",
		githubRef: "",
		githubEnvironment: "",
		maxLifetimeHours: String(MAX_LIFETIME_HOURS),
		extraConditions: {},
	};
}

function first(conditions: Record<string, string[]>, claim: string): string {
	return conditions[claim]?.[0] ?? "";
}

export function vercelTeamSlug(issuer: string): string {
	return issuer.startsWith(`${VERCEL_GLOBAL_ISSUER}/`) ? issuer.slice(VERCEL_GLOBAL_ISSUER.length + 1) : "";
}

export function draftFromPolicy(policy: SettingsWorkloadIdentityPolicy): WorkloadDraft {
	const conditions = policy.claimConditions ?? {};
	const extraConditions = Object.fromEntries(
		Object.entries(conditions).filter(([claim]) => !FORM_CLAIMS[policy.provider].includes(claim)),
	);
	const environments = (conditions.environment ?? []).filter((value): value is VercelEnvironment =>
		(VERCEL_ENVIRONMENTS as readonly string[]).includes(value));
	return {
		...emptyWorkloadDraft(policy.provider),
		name: policy.name,
		vercelTeamSlug: policy.provider === "vercel" ? vercelTeamSlug(policy.issuer) : "",
		ownerId: policy.ownerId,
		vercelProjectId: policy.provider === "vercel" ? first(conditions, "project_id") : "",
		vercelEnvironments: policy.provider === "vercel" ? environments : [],
		githubRepositoryId: policy.provider === "github_actions" ? first(conditions, "repository_id") : "",
		githubRef: policy.provider === "github_actions" ? first(conditions, "ref") : "",
		githubEnvironment: policy.provider === "github_actions" ? first(conditions, "environment") : "",
		maxLifetimeHours: String(Math.max(1, Math.round(policy.maxTokenLifetimeSeconds / 3600))),
		extraConditions,
	};
}

type Built = { ok: true; payload: WorkloadCreatePayload } | { ok: false; problem: WorkloadProblem };

export function draftToPayload(draft: WorkloadDraft): Built {
	const name = draft.name.trim();
	if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, problem: "name" };
	const hours = Number(draft.maxLifetimeHours.trim());
	if (!Number.isInteger(hours) || hours < 1 || hours > MAX_LIFETIME_HOURS) return { ok: false, problem: "lifetime" };
	const conditions: Record<string, string[]> = { ...draft.extraConditions };
	const ownerId = draft.ownerId.trim();
	let issuer: string;

	if (draft.provider === "vercel") {
		const slug = draft.vercelTeamSlug.trim().toLowerCase();
		if (slug && !SLUG.test(slug)) return { ok: false, problem: "vercelTeamSlug" };
		if (!VERCEL_TEAM_ID.test(ownerId)) return { ok: false, problem: "vercelTeamId" };
		const projectId = draft.vercelProjectId.trim();
		if (projectId && !VERCEL_PROJECT_ID.test(projectId)) return { ok: false, problem: "vercelProjectId" };
		issuer = slug ? `${VERCEL_GLOBAL_ISSUER}/${slug}` : VERCEL_GLOBAL_ISSUER;
		if (projectId) conditions.project_id = [projectId];
		// Keep the environments in a stable order.
		const environments = VERCEL_ENVIRONMENTS.filter((environment) => draft.vercelEnvironments.includes(environment));
		if (environments.length) conditions.environment = [...environments];
	} else {
		if (!NUMERIC_ID.test(ownerId)) return { ok: false, problem: "githubOwnerId" };
		const repositoryId = draft.githubRepositoryId.trim();
		if (repositoryId && !NUMERIC_ID.test(repositoryId)) return { ok: false, problem: "githubRepositoryId" };
		issuer = GITHUB_ACTIONS_ISSUER;
		if (repositoryId) conditions.repository_id = [repositoryId];
		const ref = draft.githubRef.trim();
		if (ref) conditions.ref = [ref];
		const environment = draft.githubEnvironment.trim();
		if (environment) conditions.environment = [environment];
	}

	return {
		ok: true,
		payload: {
			name,
			provider: draft.provider,
			issuer,
			owner_id: ownerId,
			claim_conditions: conditions,
			max_token_lifetime_seconds: hours * 3600,
		},
	};
}

export function toUpdatePayload(payload: WorkloadCreatePayload): WorkloadUpdatePayload {
	const { provider: _provider, issuer: _issuer, owner_id: _owner, ...update } = payload;
	return update;
}

/** True when a policy trusts every repository or project the owner has. */
export function isOwnerWide(policy: Pick<SettingsWorkloadIdentityPolicy, "provider" | "claimConditions">): boolean {
	const claim = policy.provider === "vercel" ? "project_id" : "repository_id";
	return !policy.claimConditions?.[claim]?.length;
}

export function vercelSnippet(audience: string): string {
	return `import { getVercelOidcToken } from "@vercel/oidc";

const token = await getVercelOidcToken({ audience: "${audience}" });
// Authorization: Bearer <token>`;
}

export function githubActionsSnippet(audience: string): string {
	return `permissions:
  id-token: write

steps:
  - uses: actions/github-script@v7
    with:
      script: |
        const token = await core.getIDToken("${audience}");
        // Authorization: Bearer <token>`;
}
