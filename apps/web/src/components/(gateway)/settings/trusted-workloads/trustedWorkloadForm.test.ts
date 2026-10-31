import { describe, it, expect } from "vitest";
import {
	draftFromPolicy,
	draftToPayload,
	emptyWorkloadDraft,
	isOwnerWide,
	toUpdatePayload,
	vercelTeamSlug,
} from "./trustedWorkloadForm";

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

describe("trusted workload form", () => {
	it("builds a Vercel policy for the team issuer", () => {
		const draft = { ...emptyWorkloadDraft("vercel"), name: "  Website ", vercelTeamSlug: "Acme", ownerId: " team_123 ", vercelProjectId: "prj_web", vercelEnvironments: ["preview" as const, "production" as const] };
		expect(draftToPayload(draft)).toEqual({
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
		const built = draftToPayload({ ...emptyWorkloadDraft("vercel"), name: "All", ownerId: "team_123", vercelEnvironments: [] });
		expect(built).toMatchObject({ ok: true, payload: { issuer: "https://oidc.vercel.com", claim_conditions: {} } });
	});

	it("builds a GitHub Actions policy with optional repository, ref and environment", () => {
		const draft = { ...emptyWorkloadDraft("github_actions"), name: "Evals", ownerId: "42", githubRepositoryId: "7", githubRef: "refs/heads/main", githubEnvironment: "production", maxLifetimeHours: "1" };
		expect(draftToPayload(draft)).toEqual({
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

	it("points at the field the gateway would reject", () => {
		const vercel = { ...emptyWorkloadDraft("vercel"), name: "Web", ownerId: "team_123" };
		expect(draftToPayload({ ...vercel, name: " " })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...vercel, name: "x".repeat(101) })).toEqual({ ok: false, problem: "name" });
		expect(draftToPayload({ ...vercel, vercelTeamSlug: "acme/other" })).toEqual({ ok: false, problem: "vercelTeamSlug" });
		expect(draftToPayload({ ...vercel, ownerId: "acme" })).toEqual({ ok: false, problem: "vercelTeamId" });
		expect(draftToPayload({ ...vercel, vercelProjectId: "website" })).toEqual({ ok: false, problem: "vercelProjectId" });
		expect(draftToPayload({ ...vercel, maxLifetimeHours: "13" })).toEqual({ ok: false, problem: "lifetime" });
		expect(draftToPayload({ ...vercel, maxLifetimeHours: "1.5" })).toEqual({ ok: false, problem: "lifetime" });
		const github = { ...emptyWorkloadDraft("github_actions"), name: "CI", ownerId: "42" };
		expect(draftToPayload({ ...github, ownerId: "octo-org" })).toEqual({ ok: false, problem: "githubOwnerId" });
		expect(draftToPayload({ ...github, githubRepositoryId: "octo-org/app" })).toEqual({ ok: false, problem: "githubRepositoryId" });
	});

	it("round-trips a saved policy and keeps conditions the form does not show", () => {
		const draft = draftFromPolicy(vercelPolicy);
		expect(draft).toMatchObject({ vercelTeamSlug: "acme", ownerId: "team_123", vercelProjectId: "prj_web", vercelEnvironments: ["production", "preview"], maxLifetimeHours: "2" });
		const built = draftToPayload(draft);
		expect(built).toMatchObject({ ok: true, payload: { claim_conditions: { custom_claim: ["kept"], project_id: ["prj_web"], environment: ["production", "preview"] } } });
		if (built.ok) expect(toUpdatePayload(built.payload)).toEqual({
			name: "Website production",
			claim_conditions: { custom_claim: ["kept"], project_id: ["prj_web"], environment: ["production", "preview"] },
			max_token_lifetime_seconds: 7200,
		});
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
		const edited = draftToPayload({ ...draftFromPolicy(github), githubRef: "refs/heads/next", maxLifetimeHours: "2" });
		expect(edited).toMatchObject({ ok: true, payload: { claim_conditions: { repository_id: ["7", "8"], ref: ["refs/heads/next"] }, max_token_lifetime_seconds: 7200 } });
		// Custom Vercel environments the boxes can't show survive while the boxes are untouched.
		const custom = { ...vercelPolicy, claimConditions: { environment: ["staging-eu"] } };
		expect(draftToPayload(draftFromPolicy(custom))).toMatchObject({ ok: true, payload: { claim_conditions: { environment: ["staging-eu"] } } });
	});

	it("flags policies that trust a whole team or organisation", () => {
		expect(isOwnerWide(vercelPolicy)).toBe(false);
		expect(isOwnerWide({ provider: "github_actions", claimConditions: { ref: ["refs/heads/main"] } })).toBe(true);
		expect(vercelTeamSlug("https://oidc.vercel.com")).toBe("");
	});
});
