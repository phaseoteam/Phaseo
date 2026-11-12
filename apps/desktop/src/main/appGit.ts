/**
 * Config overrides for the Git commands the app runs on its own (checkpoints, diffs, status). A repository's
 * `.git/config` can name a program as `core.fsmonitor`, which every status, diff or add would then run without
 * anyone approving it. Not for commits and pushes the user starts: their hooks are expected to run.
 */
export const appGitArgs = ["-c", "core.fsmonitor=false"] as const;
