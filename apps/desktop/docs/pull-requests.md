# GitHub proposals

Proposals lists open pull requests for a registered project with a `github.com`
origin remote. HTTPS, Git SSH and SSH URL forms are supported. The trusted main
process validates the project before reading its remote, resolves the installed
GitHub CLI and makes a noninteractive GraphQL read with literal arguments. The
CLI supplies its existing GitHub login; credentials never enter the renderer.

Cards show draft status, GitHub's review decision and the latest commit's native
aggregate check state. These summaries do not establish merge readiness or
resolution of review threads. Links are constructed from validated repository
names and positive PR numbers, then opened through the existing trusted link API.

The query requests at most 100 open PRs per page using native end cursors.
Next and Previous keep the renderer bounded to one page; First page resets an
expired cursor, and Refresh starts again from the newest results. Failed page
reads retain the confirmed rows and page number, with Retry for the requested
page. Changing project resets pagination and ignores obsolete replies.

PR details, review actions, merge checks/actions, background watchers, GitHub
account selection, enterprise hosts and other Git providers remain unfinished.
The T3 nightly check-refresh hook remains a reference for future live refresh;
this view refreshes only on selection or explicit Refresh/Retry.

Requests have a 20-second deadline and a 2 MiB output bound. Partial GraphQL
responses and malformed/excessive records fail explicitly. Unknown check states
remain unavailable. Project changes ignore obsolete replies; refresh admission
and link opening reject duplicate clicks. Failed reads offer Retry; failed
links can be opened again from the same card.

Forty-eight deterministic cases cover remote forms, canonical links, malformed
records, missing CLI/authentication errors, check summaries, partial GraphQL
responses, literal cursor delivery and malformed, repeated or empty next pages. Owned source and Windows-archive browser
fixtures cover loading, failures/retry, empty/populated cards, inert text,
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
