# GitHub pull requests

The pane surfaces (linked list, project list and one pull request with Summary, Guide, Timeline and Code) and the Pull requests page are described in [Chats and tools](chats-and-tools.md#pull-requests). This page covers how they read GitHub: the project list, the Pull requests page, background watching and the writes.

The project list shows open pull requests for a registered project with a `github.com`
origin remote. HTTPS, Git SSH and SSH URL forms are supported. The trusted main
process validates the project before reading its remote, resolves the installed
GitHub CLI and makes a noninteractive GraphQL read with literal arguments. The
CLI supplies its existing GitHub login; credentials never enter the renderer.

Rows show draft status, GitHub's review decision and the latest commit's native
aggregate check state. These summaries do not establish merge readiness or
resolution of review threads. Links are constructed from validated repository
names and positive PR numbers, then opened through the existing trusted link API.

The query requests at most 100 open PRs per page using native end cursors.
**Load more** appends the next page, and Refresh starts again from the newest
results. Failed reads keep the rows already shown, with the error above them.
Changing project resets the list and ignores obsolete replies.

Watched pull requests are polled in the background (see [Watching](chats-and-tools.md#watching)). GitHub
account selection and enterprise hosts remain unfinished. Other code hosts are below.
The T3 nightly check-refresh hook remains a reference for future live refresh;
the selected page also refreshes while visible: every 45 seconds for empty, pending or unavailable check states, and 60 seconds for settled states. Focus/visibility return is limited to one refresh per ten seconds; six idle minutes pause polling until interaction resumes. Page errors pause automatic retry. Manual Refresh/Retry remains available. This is foreground refresh; the background watcher below is separate.

Requests have a 20-second deadline and a 2 MiB output bound. Partial GraphQL
responses and malformed/excessive records fail explicitly. Unknown check states
remain unavailable. Project changes ignore obsolete replies; refresh admission
and link opening reject duplicate clicks. Failed reads offer Retry; failed
links can be opened again from the same row.

Forty-eight deterministic cases cover remote forms, canonical links, malformed
records, missing CLI/authentication errors, check summaries, partial GraphQL
responses, literal cursor delivery and malformed, repeated or empty next pages. Owned source and Windows-archive browser
fixtures cover loading, failures/retry, empty/populated lists, inert text,
20-pixel insets, project switching, link delivery and unregistered-project
rejection, page navigation, duplicate suppression and failure recovery. External browser display and full accessibility remain unverified.

`pnpm --filter @phaseo/desktop exec node scripts/pull-requests-smoke.mjs --live`
compiles the production adapter and uses the installed CLI to read the public
Phaseo repository through a temporary owned Git project. The verified result
returned 100 records followed by 12 on the next cursor page, without changing project state or
GitHub metadata. It requires a usable CLI login and is separate from deterministic
CI. Initial full-context `gh pr list` reads hit a GitHub 504; the compact query
retains the 100-record bound and requests only the aggregate check state needed
by the cards.

References: [GitHub cursor pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api), [GitHub CLI API](https://cli.github.com/manual/gh_api) and the pinned
[T3 nightly refresh hook](https://github.com/pingdotgg/t3code/blob/737993303d36e10674c54b95e5bd3826682c99c7/apps/web/src/hooks/usePullRequestChecksRefresh.ts).

Eight deterministic timer/event cases cover first-read suppression, 45/60-second intervals, focus coalescing, hidden/idle pauses, resumed interaction, busy admission and cleanup. Owned source/archive browser cases drive the production controller clock, confirm one IPC read when a timer and focus arrive together, project pending checks to passing, choose the settled interval, prove successive responses do not reset the idle clock, resume after interaction and stop the timer after project removal. Native OS visibility and complete background-watcher parity remain separate checks.

The idle browser fixture isolates its virtual clock from incidental trusted input in the owned audit window and waits for rendered reads to settle. It exercises the production controller using explicit synthetic interaction; it does not establish native OS focus or visibility behavior. The archive and source renderer assets are verified identical.

## Other code hosts

A project whose origin is on GitLab, Forgejo or Gitea, Bitbucket or Azure DevOps reads its pull or merge requests
through `src/main/codeHosts`. The host comes from the remote URL: gitlab.com, codeberg.org, gitea.com, bitbucket.org,
dev.azure.com and *.visualstudio.com, servers with gitlab, gitea or forgejo in their name, and servers named in
Settings ▸ Code hosts. GitHub and unknown servers keep the gh path above unchanged.

Each host signs in its own way. GitLab uses a saved token, else `glab api` with its login. Forgejo and Gitea use a
saved token, else `tea api`. Bitbucket needs a saved access token or Atlassian email and API token. Azure DevOps
uses a saved personal access token, else a token from `az account get-access-token`. Tokens are kept in the
credential vault; `code-hosts.json` only records which servers have one.

| | GitLab | Forgejo / Gitea | Bitbucket | Azure DevOps |
| --- | --- | --- | --- | --- |
| Project list, Pull requests page (open only) | yes | yes | yes | yes |
| Summary and Timeline: checks, reviews, comments, commits | pipeline jobs | commit statuses | build statuses | PR statuses |
| Line totals | no (files only) | yes | yes (diffstat) | no |
| Create for the current branch | yes | yes | yes | yes |
| Merge (methods) | merge, squash | merge, squash, rebase | merge, squash | merge, squash, rebase |
| Auto-merge on and off | yes | yes | no | yes (auto-complete) |
| Comment, close, reopen, title, description, draft | yes | yes | no reopen | yes |
| Review | approve, comment | approve, request changes, comment | approve, request changes, comment | approve, wait for author, comment |

Not yet on other hosts: the Guide and Code tabs (they read the diff through GitHub), line comments and review
threads, labels and reviewer pickers, reactions, stacks, linking a request to a chat, background watching and the
agents' pull request tools. Writes a host can't make are refused with a message that names it. Merges are held to the
head the person saw: GitLab's `sha`, Forgejo's `head_commit_id` and Azure's `lastMergeSourceCommit` refuse a
moved head, and Bitbucket's head is read again just before merging because its merge has no such guard.

## Pull requests page

`src/main/pullRequestDirectory.ts` reads every project at once for the Pull requests page (`workspace:pull-request-directory`, validated by `validatePullRequestDirectoryQuery` in `src/shared/pullRequestDirectory.ts`). Worktrees are skipped, since they share their project's repository; each other project's `origin` must be a `github.com` remote, and a repository two projects share is read once and filed under the project added first. A project without one, or whose read fails, is returned in `errors` with a readable message (GitHub CLI output is passed through `ghFailure`, so tokens never reach the renderer), and the rest still load.

Repositories are read ten to a query through GitHub's search (`search(type: ISSUE)` in GraphQL), as T3 Code's GitHub provider does: `is:pr archived:false repo:… repo:…` plus the state (`is:open`; `is:closed is:unmerged`; `is:merged`; nothing for all), the qualifiers typed or chosen (`label:a,b` for either, `-label:x`, `author:login` or `author:@me`, `draft:true|false`, `review:approved|changes_requested|required|none`, `status:success|failure`), the remaining words (any containing a colon are quoted) and `sort:updated-desc`. Each query asks for 100 rows and follows the end cursor up to the page size the renderer asks for (100, raised by 100 per **Load more**, at most 500); `truncated` says more remain. Each row carries the head commit, so quick actions can check it has not moved, its labels, author avatar, line counts, review decision, the head commit's check rollup, mergeability, and whether the signed-in account (`viewer`) is among the requested reviewers. Rows from outside the queried repositories, or malformed, are dropped.

The renderer (`src/renderer/views/pullRequests/PullRequestsPage.tsx`, rules in `pullRequestDirectory.logic.ts`) keeps the last answer on screen while a new question is asked and narrows it locally by state, project, involvement, labels, author, draft and review, so changing a filter never blanks the list; checks are left to GitHub. Search text is sent after a 250 ms pause. Answers are kept for the session, so coming back to the page draws the last list at once. Quick actions write through `workspace:pull-request-action` (merge reads the pull request first for its allowed methods and head) and show their result at once; a later read that still shows the old state is taken for GitHub's search index lagging for one minute.

## Background watching

`src/main/pullRequestWatcher.ts` ports T3 Code's PullRequestWatchReactor and `src/shared/pullRequestWatch.ts` its `evaluatePullRequestWatch` and update messages. Every two minutes (the first pass 15 seconds after start) the main process collects every chat link with `watching`, ends without a read the watches of merged pull requests and of chats that are archived, settled or delegated, and reads each remaining pull request once with the same GraphQL view the pane uses (checks with their `isRequired` flag, comments with `lastEditedAt`), from the chat's project folder or the app folder. The read refreshes every linked chat's snapshot.

Each link stores what its agent was last told (`watch`: start time, head commit, failed and passed check names, the remark watermark with the ids at that second, whether it conflicts, and comment-only wakes in a row). A moved head starts the check state over. `WorkspaceStore.recordPullRequestWatch` applies a pass only while the same watch is on, so a stop during the read wins, and queues the update as a message carrying `notice` (summary, outcome, URL); the runtime starts an idle chat and raises the desktop notification through `TaskNotifications.notice`. A merged pull request ends quietly; a closed one, or 8 failed reads in a row, ends with one last update; 10 comment-only updates in a row stop it. gh errors that mention a rate limit or HTTP 429 pause all passes, doubling from 2 to 30 minutes, without counting as failures. Unlike T3, there is no host fingerprint or quiet-reread gate: every watched pull request is read on every pass.

The agent tools `link_pull_request`, `unlink_pull_request`, `watch_pull_request` and `unwatch_pull_request` (`src/main/threadTools.ts`, `WorkspaceThreads.forThread().pullRequest`) run the same workspace commands as the pane. Links they make are marked `source: "agent"`; the renderer cannot set that.

## Writes beyond the basics

Auto-merge uses `gh pr merge N --repo R --auto --<method> --match-head-commit <head>` and `--disable-auto`. Reactions use the GraphQL `addReaction` and `removeReaction` mutations on a comment the view lists. Labels use the issues labels REST endpoints and reviewers the `requested_reviewers` endpoint; the pickers read candidates through `workspace:pull-request-candidates` (up to 100 labels or assignable users). Reactions, labels and reviewers do not depend on the code, so they are not refused when the head moved since the pane was read. **Check out** (`workspace:pull-request-worktree`, `src/main/pullRequestCheckout.ts`) fetches `refs/pull/N/head` (and the same-repository branch into `origin/<branch>`) under the project's Git lock, then creates the worktree through `WorkspaceRuntime.createWorktree`. **Guide** (`workspace:pull-request-guide`, `src/main/pullRequestGuides.ts`, `src/shared/pullRequestGuide.ts`) reads `gh pr diff N --repo R`, parses it into numbered hunks, sends up to about 120,000 characters of it with T3's guide instructions to the title model (`WorkspaceRuntime.completeWithTitleModel`, the same `/chat/completions` call as chat titles, 8,000 output tokens, three minutes), parses the JSON reply and normalises it against the diff. The result is stored as JSON under the workspace folder's `pull-request-guides/`, one file per repository and number, with the head commit it was written for; reading it never calls a model. One run per pull request at a time; a second request for the same head joins it, and a failure is reported for the head it was about. **In this repository** (`workspace:pull-request-checkout-here`, `checkoutPullRequestHere`) runs under the same lock and `WorkspaceRuntime.mutateProject`: it refuses when `git status --porcelain` lists anything, fetches the same refs, then either switches to an existing `<branch>` or `pull/N` that is an ancestor of the head and fast-forwards it (`merge --ff-only`), or creates a new branch at the head with `switch -c`; unlike `gh pr checkout --force` it never resets a branch. A branch checked out in another worktree (`git worktree list --porcelain`) is refused.
