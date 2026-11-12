import type { PhoneCapability, PhoneChecksState, PhoneGitAction, PhoneMergeMethod, PhonePullRequestCheck, PhoneResults, PhoneReviewState } from "../protocol";

type Connection = { status: string; protocol?: number; capabilities?: readonly PhoneCapability[] };
/** Git and pull requests show while the computer speaks protocol 6 and lets this phone read code. */
export const readsGit = (state: Connection) => state.status === "connected" && (state.protocol ?? 0) >= 6 && Boolean(state.capabilities?.includes("code"));
/** Commit, push, branches, worktrees and pull request actions also need Make changes on the computer. */
export const makesChanges = (state: Connection) => readsGit(state) && Boolean(state.capabilities?.includes("changes"));

type GitStatus = PhoneResults["git_status"];

/**
 * The status an action answered with. It doesn't carry the branch's pull request, so the last one stays while the
 * branch does; on another branch, or while it was still being read (the action supersedes that read), it's unknown
 * and read again, rather than showing the old branch's or nothing.
 */
export function afterAction(previous: GitStatus | null, next: GitStatus): { status: GitStatus; reload: boolean } {
  if (next.pullRequest !== undefined) return { status: next, reload: false };
  if (previous?.pullRequest !== undefined && previous.branch === next.branch) return { status: { ...next, pullRequest: previous.pullRequest }, reload: false };
  return { status: next, reload: true };
}

/** The branch line under its name: how far it is from its upstream, or why there's nothing to push to. */
export function upstreamLabel(status: GitStatus) {
  if (!status.repository) return "Not a git checkout";
  if (!status.branch) return "Not on a branch";
  if (!status.upstream) return status.hasRemote ? "Not pushed yet" : "No remote, so nothing to push to or pull from";
  const { ahead, behind, name } = status.upstream;
  if (!ahead && !behind) return `Up to date with ${name}`;
  return [ahead ? `${ahead} to push` : null, behind ? `${behind} to pull` : null].filter(Boolean).join(", ") + ` · ${name}`;
}

export const changedLabel = (count: number) => (count ? `${count} changed ${count === 1 ? "file" : "files"}` : "No changes");

/** Push is offered once the branch has somewhere to go and something to send (or hasn't been pushed yet). */
export const canPush = (status: GitStatus) => status.repository && Boolean(status.branch) && status.hasRemote && (!status.upstream || status.upstream.ahead > 0);
export const canPull = (status: GitStatus) => status.repository && Boolean(status.upstream);

/** What the progress row says while an action runs on the computer. */
export const gitProgress: Record<PhoneGitAction | "commit-push" | "message" | "pull-request", string> = {
  stage: "Staging…", unstage: "Unstaging…", commit: "Committing…", "commit-push": "Committing and pushing…", push: "Pushing…", pull: "Pulling…",
  "create-branch": "Creating the branch…", "switch-branch": "Switching branch…", message: "Writing a message…", "pull-request": "Creating the pull request…",
};

/** Branches to switch to: the local ones other than the current, newest first as the computer listed them. */
export const switchableBranches = (refs: PhoneResults["list_branches"]) => refs.local.filter((name) => name !== refs.current);

/** Bases a new worktree can start from: the current branch first, then other local branches, then remote ones. */
export function worktreeBases(refs: PhoneResults["list_branches"]) {
  const seen = new Set<string>(), bases: string[] = [];
  for (const name of [refs.current, ...refs.local, ...refs.remote]) if (name && !seen.has(name)) { seen.add(name); bases.push(name); }
  return bases;
}

export const reviewWords: Record<PhoneReviewState, string | null> = { approved: "Approved", "changes-requested": "Changes requested", required: "Review required", none: null };
export const checksWords: Record<PhoneChecksState, string | null> = { passing: "Checks passing", pending: "Checks running", failed: "Checks failing", none: null, unknown: null };
export const mergeWords: Record<PhoneMergeMethod, string> = { squash: "Squash and merge", merge: "Create a merge commit", rebase: "Rebase and merge" };

/** The method Merge starts with: the computer's setting when the repository allows it, else squash, merge, rebase in that order. */
export const defaultMergeMethod = (view: { mergeMethods: PhoneMergeMethod[]; mergeMethod?: PhoneMergeMethod }) => view.mergeMethod ?? view.mergeMethods[0] ?? null;

/** Checks counted the way the window's summary reads ("2 passing, 1 failing, 1 running"). */
export function checkSummary(checks: readonly PhonePullRequestCheck[]) {
  const count = (status: PhonePullRequestCheck["status"]) => checks.filter((check) => check.status === status).length;
  const parts = [[count("failed"), "failing"], [count("pending"), "running"], [count("passing"), "passing"], [count("skipped") + count("neutral"), "skipped"]] as const;
  return parts.filter(([value]) => value > 0).map(([value, word]) => `${value} ${word}`).join(", ") || "No checks";
}

/** Why Merge can't be pressed, or null when it can. */
export function mergeBlocker(view: Pick<PhoneResults["read_pull_request"], "state" | "draft" | "mergeable" | "viewer" | "mergeMethods">) {
  if (view.state !== "open") return view.state === "merged" ? "Already merged." : "This pull request is closed.";
  if (view.draft) return "This is a draft. Mark it ready on GitHub or the computer first.";
  if (!view.viewer.canMerge) return "The computer's GitHub sign-in can't merge this.";
  if (view.mergeable === "conflicting") return "This branch has conflicts to resolve first.";
  if (!view.mergeMethods.length) return "The repository allows no merge method the phone offers.";
  return null;
}
