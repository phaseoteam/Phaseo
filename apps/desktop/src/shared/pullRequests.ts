export type PullRequest = {
	number: number; title: string; url: string; author: string; draft: boolean;
	head: string; base: string; updatedAt: string;
	review: "approved" | "changes-requested" | "required" | "none";
	checks: "passing" | "pending" | "failed" | "none" | "unknown";
};
export type ProjectPullRequests = { repository: string; requests: PullRequest[]; fetchedAt: string; limitReached: boolean; nextCursor?: string };

export type PullRequestDetails = PullRequest & { repository: string; body: string; state: "OPEN" | "CLOSED" | "MERGED"; additions: number; deletions: number; changedFiles: number; headOid: string; baseOid: string; mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"; mergeState: string; fetchedAt: string };
