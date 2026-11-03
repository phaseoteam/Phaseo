import { afterAction, canPush, checkSummary, defaultMergeMethod, makesChanges, mergeBlocker, readsGit, switchableBranches, upstreamLabel, worktreeBases } from "./gitState";

const status = { repository: true, branch: "main", hasRemote: false, files: [] };

describe("git on a phone", () => {
  it("keeps the branch's pull request after an action on the same branch, and reads it again after a switch", () => {
    const pullRequest = { repository: "phaseo/phaseo", number: 7, url: "https://github.com/phaseo/phaseo/pull/7", title: "Fix", state: "open" as const, draft: false };
    const before = { ...status, hasRemote: true, pullRequest };
    expect(afterAction(before, { ...status, hasRemote: true })).toEqual({ status: before, reload: false });
    // Another branch's pull request isn't #7: it's unknown until the computer says, so Create pull request can show if it has none.
    expect(afterAction(before, { ...status, branch: "fix/other", hasRemote: true })).toEqual({ status: { ...status, branch: "fix/other", hasRemote: true }, reload: true });
    expect(afterAction({ ...before, pullRequest: null }, { ...status, branch: "fix/other", hasRemote: true })).toMatchObject({ reload: true });
  });

  it("shows git from protocol 6 with Read code, and changes only with Make changes too", () => {
    expect(readsGit({ status: "connected", protocol: 6, capabilities: ["code"] })).toBe(true);
    expect(makesChanges({ status: "connected", protocol: 6, capabilities: ["code"] })).toBe(false);
    expect(makesChanges({ status: "connected", protocol: 6, capabilities: ["code", "changes"] })).toBe(true);
    // Make changes alone isn't enough: the computer refuses a change from a phone that can't read code.
    expect(makesChanges({ status: "connected", protocol: 6, capabilities: ["changes"] })).toBe(false);
    expect(makesChanges({ status: "connected", protocol: 5, capabilities: ["code", "changes"] })).toBe(false);
    expect(makesChanges({ status: "offline", protocol: 6, capabilities: ["code", "changes"] })).toBe(false);
  });

  it("says where the branch stands against its upstream, and why there's nowhere to push", () => {
    expect(upstreamLabel(status)).toBe("No remote, so nothing to push to or pull from");
    expect(upstreamLabel({ ...status, hasRemote: true })).toBe("Not pushed yet");
    expect(upstreamLabel({ ...status, hasRemote: true, upstream: { name: "origin/main", ahead: 2, behind: 1 } })).toBe("2 to push, 1 to pull · origin/main");
    expect(upstreamLabel({ ...status, hasRemote: true, upstream: { name: "origin/main", ahead: 0, behind: 0 } })).toBe("Up to date with origin/main");
    expect(canPush(status)).toBe(false);
    expect(canPush({ ...status, hasRemote: true })).toBe(true);
    expect(canPush({ ...status, hasRemote: true, upstream: { name: "origin/main", ahead: 0, behind: 3 } })).toBe(false);
  });

  it("offers the other local branches to switch to, and worktree bases current branch first", () => {
    const refs = { current: "fix/usage", local: ["main", "fix/usage", "docs"], remote: ["origin/main", "origin/fix/usage"] };
    expect(switchableBranches(refs)).toEqual(["main", "docs"]);
    expect(worktreeBases(refs)).toEqual(["fix/usage", "main", "docs", "origin/main", "origin/fix/usage"]);
  });

  it("merges with the computer's method when allowed, and says why a merge can't go", () => {
    expect(defaultMergeMethod({ mergeMethods: ["squash", "merge"], mergeMethod: "merge" })).toBe("merge");
    expect(defaultMergeMethod({ mergeMethods: ["rebase"] })).toBe("rebase");
    const open = { state: "open" as const, draft: false, mergeable: "mergeable" as const, viewer: { canMerge: true, canUpdate: true }, mergeMethods: ["squash" as const] };
    expect(mergeBlocker(open)).toBeNull();
    expect(mergeBlocker({ ...open, mergeable: "conflicting" })).toBe("This branch has conflicts to resolve first.");
    expect(mergeBlocker({ ...open, draft: true })).toContain("draft");
    expect(mergeBlocker({ ...open, viewer: { canMerge: false, canUpdate: true } })).toBe("The computer's GitHub sign-in can't merge this.");
    expect(mergeBlocker({ ...open, state: "merged" })).toBe("Already merged.");
    expect(checkSummary([{ name: "build", status: "passing" }, { name: "lint", status: "failed" }, { name: "e2e", status: "pending" }])).toBe("1 failing, 1 running, 1 passing");
    expect(checkSummary([])).toBe("No checks");
  });
});
