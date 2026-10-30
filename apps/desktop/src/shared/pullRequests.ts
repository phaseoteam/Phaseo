import type { PullRequestStackMembership } from "./pullRequestStacks";

export type PullRequest = {
	number: number; title: string; url: string; author: string; draft: boolean;
	head: string; base: string; updatedAt: string;
	review: "approved" | "changes-requested" | "required" | "none";
	checks: "passing" | "pending" | "failed" | "none" | "unknown";
	authorAvatarUrl?: string;
	/** Where it sits in a native GitHub stack, where GitHub reports one. */
	stack?: PullRequestStackMembership;
};
export type ProjectPullRequests = { repository: string; requests: PullRequest[]; fetchedAt: string; limitReached: boolean; nextCursor?: string };

export type PullRequestDetails = PullRequest & { repository: string; body: string; state: "OPEN" | "CLOSED" | "MERGED"; additions: number; deletions: number; changedFiles: number; headOid: string; baseOid: string; mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"; mergeState: string; fetchedAt: string };

/** The pull request for a checkout's current branch, linked to a chat or not; `defaultBranch` is origin's. */
export type BranchPullRequest = { branch: string; defaultBranch?: string; pullRequest: { repository: string; number: number; url: string; title: string; state: "OPEN" | "CLOSED" | "MERGED"; draft: boolean } | null };
export type CreatedPullRequestResult = { repository: string; number: number; url: string; status: "created" | "opened_existing" };
