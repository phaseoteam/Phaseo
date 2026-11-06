import { describe, it, expect } from "vitest";
import type { SettingsWorkloadIdentityProvider } from "@/lib/fetchers/internal/settingsTypes";
import {
	WORKLOAD_PROVIDERS,
	draftFromPolicy,
	draftToPayload,
	emptyWorkloadDraft,
	isOwnerWide,
	policyOwnerClaim,
	toUpdatePayload,
	tokenSnippet,
	vercelTeamSlug,
	type WorkloadDraft,
} from "./trustedWorkloadForm";

const ORG = "0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const PROJECT = "4c2d9e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const AWS_ISSUER = `https://${ORG}.tokens.sts.global.api.aws`;
const ROLE = "arn:aws:iam::123456789012:role/evals";

const vercelPolicy = {
	id: "p1",
	name: "Website production",
	provider: "vercel" as const,
	issuer: "https://oidc.vercel.com/acme",
	ownerId: "team_123",
	claimConditions: { project_id: ["prj_web"], environment: ["production", "preview"], custom_claim: ["kept"] },
	maxTokenLifetimeSeconds: 7200,
	status: "active" as const,
	lastUsedAt: null,
	createdAt: null,
	updatedAt: null,
};

function draft(provider: SettingsWorkloadIdentityProvider, fields: Partial<WorkloadDraft>): WorkloadDraft {
	return { ...emptyWorkloadDraft(provider), name: "Policy", ...fields };
}

describe("trusted workload form", () => {
	it("builds a Vercel policy for the team issuer", () => {
		const built = draftToPayload(draft("vercel", { name: "  Website ", issuer: "Acme", ownerId: " team_123 ", conditions: { project_id: "prj_web" }, vercelEnvironments: ["preview", "production"] }));
		expect(built).toEqual({
			ok: true,
			payload: {
				name: "Website",
				provider: "vercel",
				issuer: "https://oidc.vercel.com/acme",
				owner_id: "team_123",
				claim_conditions: { project_id: ["prj_web"], environment: ["production", "preview"] },
				max_token_lifetime_seconds: 43_200,
			},
		});
	});

	it("uses Vercel's global issuer when no team slug is given", () => {
		const built = draftToPayload(draft("vercel", { ownerId: "team_123", vercelEnvironments: [] }));
		expect(built).toMatchObject({ ok: true, payload: { issuer: "https://oidc.vercel.com", claim_conditions: {} } });
	});

	it("builds a GitHub Actions policy with optional repository, ref and environment", () => {
		const built = draftToPayload(draft("github_actions", { name: "Evals", ownerId: "42", conditions: { repository_id: "7", ref: "refs/heads/main", environment: "production" }, maxLifetimeHours: "1" }));
		expect(built).toEqual({
			ok: true,
			payload: {
				name: "Evals",
				provider: "github_actions",
				issuer: "https://token.actions.githubusercontent.com",
				owner_id: "42",
				claim_conditions: { repository_id: ["7"], ref: ["refs/heads/main"], environment: ["production"] },
				max_token_lifetime_seconds: 3600,
			},
		});
	});

	it("builds a policy for each other platform with its issuer and pinned owner", () => {
		const cases: Array<[WorkloadDraft, Record<string, unknown>]> = [
			[draft("gitlab", { ownerId: "12345", conditions: { ref: "main", environment: "production" } }),
				{ provider: "gitlab", issuer: "https://gitlab.com", owner_id: "12345", claim_conditions: { ref: ["main"], environment: ["production"] } }],
			[draft("google_cloud", { ownerId: "104523456789012345678", conditions: { email: "app@project.iam.gserviceaccount.com" } }),
				{ provider: "google_cloud", issuer: "https://accounts.google.com", owner_id: "104523456789012345678", claim_conditions: { email: ["app@project.iam.gserviceaccount.com"] } }],
			[draft("buildkite", { ownerId: ORG.toUpperCase(), conditions: { pipeline_slug: "deploy" } }),
				{ provider: "buildkite", issuer: "https://agent.buildkite.com", owner_id: ORG, claim_conditions: { pipeline_slug: ["deploy"] } }],
			[draft("circleci", { ownerId: ORG, conditions: { "oidc.circleci.com/project-id": PROJECT } }),
				{ provider: "circleci", issuer: `https://oidc.circleci.com/org/${ORG}`, owner_id: ORG, claim_conditions: { "oidc.circleci.com/project-id": [PROJECT] } }],
			[draft("aws", { issuer: ` ${AWS_ISSUER} `, ownerId: ROLE }),
				{ provider: "aws", issuer: AWS_ISSUER, owner_id: ROLE, claim_conditions: {} }],
			[draft("custom", { issuer: "https://k8s.example.com", ownerId: "system:serviceaccount:default:app", customClaim: "kubernetes.io/namespace", customValue: "default" }),
				{ provider: "custom", issuer: "https://k8s.example.com", owner_claim: "sub", owner_id: "system:serviceaccount:default:app", claim_conditions: { "kubernetes.io/namespace": ["default"] } }],
		];
		for (const [input, payload] of cases) expect(draftToPayload(input)).toEqual({ ok: true, payload: { name: "Policy", max_token_lifetime_seconds: 43_200, ...payload } });
		// Only custom issuers send an owner claim; presets have a fixed one.
		expect(draftToPayload(draft("gitlab", { ownerId: "1" }))).not.toHaveProperty("payload.owner_claim");
	});

	it("points at the field the gateway would reject", () => {
		const vercel = draft("vercel", { name: "Web", ownerId: "team_123" });
		expect(draftToPayload({ ...vercel, name: " " })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...vercel, name: "x".repeat(101) })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...vercel, issuer: "acme/other" })).toEqual({ ok: false, problem: "vercelTeamSlug" });
		expect(draftToPayload({ ...vercel, ownerId: "acme" })).toEqual({ ok: false, problem: "vercelTeamId" });
		expect(draftToPayload({ ...vercel, conditions: { project_id: "website" } })).toEqual({ ok: false, problem: "vercelProjectId" });
		expect(draftToPayload({ ...vercel, maxLifetimeHours: "13" })).toEqual({ ok: false, problem: "lifetime" });
		expect(draftToPayload({ ...vercel, maxLifetimeHours: "1.5" })).toEqual({ ok: false, problem: "lifetime" });
		const github = draft("github_actions", { ownerId: "42" });
		expect(draftToPayload({ ...github, ownerId: "octo-org" })).toEqual({ ok: false, problem: "githubOwnerId" });
		expect(draftToPayload({ ...github, conditions: { repository_id: "octo-org/app" } })).toEqual({ ok: false, problem: "githubRepositoryId" });
		expect(draftToPayload(draft("gitlab", { ownerId: "group/project" }))).toEqual({ ok: false, problem: "gitlabProjectId" });
		expect(draftToPayload(draft("google_cloud", { ownerId: "app@project.iam.gserviceaccount.com" }))).toEqual({ ok: false, problem: "googleServiceAccountId" });
		expect(draftToPayload(draft("google_cloud", { ownerId: "1045", conditions: { email: "app" } }))).toEqual({ ok: false, problem: "googleServiceAccountEmail" });
		expect(draftToPayload(draft("buildkite", { ownerId: "acme" }))).toEqual({ ok: false, problem: "buildkiteOrganizationId" });
		expect(draftToPayload(draft("circleci", { ownerId: "acme" }))).toEqual({ ok: false, problem: "circleciOrganizationId" });
		expect(draftToPayload(draft("circleci", { ownerId: ORG, conditions: { "oidc.circleci.com/project-id": "gh/acme/app" } }))).toEqual({ ok: false, problem: "circleciProjectId" });
		expect(draftToPayload(draft("aws", { issuer: "https://sts.amazonaws.com", ownerId: ROLE }))).toEqual({ ok: false, problem: "awsIssuer" });
		expect(draftToPayload(draft("aws", { issuer: AWS_ISSUER, ownerId: "arn:aws:iam::123:role/evals" }))).toEqual({ ok: false, problem: "awsRoleArn" });
		expect(draftToPayload(draft("aws", { issuer: AWS_ISSUER, ownerId: "arn:aws:iam::123456789012:user/me" }))).toEqual({ ok: false, problem: "awsRoleArn" });
		const custom = draft("custom", { issuer: "https://k8s.example.com", ownerId: "app" });
		for (const issuer of ["http://k8s.example.com", "https://k8s.example.com:8443", "https://k8s.example.com/?a=1", "https://localhost", "not a url"]) {
			expect(draftToPayload({ ...custom, issuer })).toEqual({ ok: false, problem: "customIssuer" });
		}
		expect(draftToPayload({ ...custom, ownerClaim: "aud" })).toEqual({ ok: false, problem: "customOwnerClaim" });
		expect(draftToPayload({ ...custom, ownerClaim: "has space" })).toEqual({ ok: false, problem: "customOwnerClaim" });
		expect(draftToPayload({ ...custom, ownerId: " " })).toEqual({ ok: false, problem: "customOwnerId" });
		expect(draftToPayload({ ...custom, customClaim: "environment" })).toEqual({ ok: false, problem: "customCondition" });
		expect(draftToPayload({ ...custom, customValue: "default" })).toEqual({ ok: false, problem: "customCondition" });
		expect(draftToPayload({ ...custom, customClaim: "sub", customValue: "x" })).toEqual({ ok: false, problem: "customCondition" });
	});

	it("round-trips a saved policy and keeps conditions the form does not show", () => {
		const loaded = draftFromPolicy(vercelPolicy);
		expect(loaded).toMatchObject({ issuer: "acme", ownerId: "team_123", conditions: { project_id: "prj_web" }, vercelEnvironments: ["production", "preview"], maxLifetimeHours: "2" });
		const built = draftToPayload(loaded);
		expect(built).toMatchObject({ ok: true, payload: { claim_conditions: { custom_claim: ["kept"], project_id: ["prj_web"], environment: ["production", "preview"] } } });
		if (built.ok) expect(toUpdatePayload(built.payload)).toEqual({
			name: "Website production",
			claim_conditions: { custom_claim: ["kept"], project_id: ["prj_web"], environment: ["production", "preview"] },
			max_token_lifetime_seconds: 7200,
		});
	});

	it("round-trips saved policies for the new platforms, leaving out what cannot change", () => {
		const saved = (provider: SettingsWorkloadIdentityProvider, issuer: string, ownerId: string, claimConditions: Record<string, string[]>, ownerClaim?: string) =>
			({ ...vercelPolicy, provider, issuer, ownerId, claimConditions, ownerClaim });
		const custom = saved("custom", "https://k8s.example.com", "app", { "kubernetes.io/namespace": ["default", "staging"], team: ["ml"] }, "kubernetes.io/serviceaccount/name");
		const loaded = draftFromPolicy(custom);
		expect(loaded).toMatchObject({ issuer: "https://k8s.example.com", ownerClaim: "kubernetes.io/serviceaccount/name", customClaim: "kubernetes.io/namespace", customValue: "default", extraConditions: { team: ["ml"] } });
		const built = draftToPayload({ ...loaded, name: "Renamed" });
		expect(built).toMatchObject({ ok: true, payload: { owner_claim: "kubernetes.io/serviceaccount/name", claim_conditions: custom.claimConditions } });
		if (built.ok) expect(toUpdatePayload(built.payload)).toEqual({ name: "Renamed", claim_conditions: custom.claimConditions, max_token_lifetime_seconds: 7200 });

		const aws = draftFromPolicy(saved("aws", AWS_ISSUER, ROLE, {}));
		expect(draftToPayload(aws)).toMatchObject({ ok: true, payload: { issuer: AWS_ISSUER, owner_id: ROLE } });
		const circleci = draftFromPolicy(saved("circleci", `https://oidc.circleci.com/org/${ORG}`, ORG, { "oidc.circleci.com/project-id": [PROJECT] }));
		expect(circleci.conditions).toEqual({ "oidc.circleci.com/project-id": PROJECT });
		expect(draftToPayload({ ...circleci, conditions: {} })).toMatchObject({ ok: true, payload: { claim_conditions: {} } });
	});

	it("keeps saved value lists and lifetime when those fields are not edited", () => {
		const github = {
			...vercelPolicy,
			provider: "github_actions" as const,
			issuer: "https://token.actions.githubusercontent.com",
			ownerId: "42",
			claimConditions: { repository_id: ["7", "8"], ref: ["refs/heads/main", "refs/heads/release"] },
			maxTokenLifetimeSeconds: 300,
		};
		// Only the name changes.
		const renamed = draftToPayload({ ...draftFromPolicy(github), name: "Renamed" });
		expect(renamed).toMatchObject({ ok: true, payload: { claim_conditions: github.claimConditions, max_token_lifetime_seconds: 300 } });
		// Editing one field replaces only that field's list.
		const loaded = draftFromPolicy(github);
		const edited = draftToPayload({ ...loaded, conditions: { ...loaded.conditions, ref: "refs/heads/next" }, maxLifetimeHours: "2" });
		expect(edited).toMatchObject({ ok: true, payload: { claim_conditions: { repository_id: ["7", "8"], ref: ["refs/heads/next"] }, max_token_lifetime_seconds: 7200 } });
		// Custom Vercel environments the boxes can't show survive while the boxes are untouched.
		const custom = { ...vercelPolicy, claimConditions: { environment: ["staging-eu"] } };
		expect(draftToPayload(draftFromPolicy(custom))).toMatchObject({ ok: true, payload: { claim_conditions: { environment: ["staging-eu"] } } });
	});

	it("flags policies that trust a whole team, owner or organisation", () => {
		expect(isOwnerWide(vercelPolicy)).toBe(false);
		expect(isOwnerWide({ provider: "github_actions", claimConditions: { ref: ["refs/heads/main"] } })).toBe(true);
		expect(isOwnerWide({ provider: "buildkite", claimConditions: {} })).toBe(true);
		expect(isOwnerWide({ provider: "circleci", claimConditions: { "oidc.circleci.com/project-id": [PROJECT] } })).toBe(false);
		// The owner is already one project, service account or role.
		for (const provider of ["gitlab", "google_cloud", "aws", "custom"] as const) expect(isOwnerWide({ provider, claimConditions: {} })).toBe(false);
		expect(vercelTeamSlug("https://oidc.vercel.com")).toBe("");
	});

	it("names each policy's owner claim", () => {
		expect(policyOwnerClaim({ provider: "circleci" })).toBe("oidc.circleci.com/org-id");
		expect(policyOwnerClaim({ provider: "aws", ownerClaim: "ignored" })).toBe("sub");
		expect(policyOwnerClaim({ provider: "custom", ownerClaim: "workspaceUuid" })).toBe("workspaceUuid");
	});

	it("shows every platform how to request a token for the audience", () => {
		for (const provider of WORKLOAD_PROVIDERS) expect(tokenSnippet(provider, "https://api.phaseo.app")).toContain("https://api.phaseo.app");
		expect(tokenSnippet("gitlab", "https://api.phaseo.app")).toContain("id_tokens:");
		expect(tokenSnippet("aws", "https://api.phaseo.app")).toContain("--signing-algorithm");
	});
});
