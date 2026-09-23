# Gateway overhaul: PR-based restart

## Change brief

Restart the routing overhaul from the published state of PR #2465, not the
unpublished staging experiments. Implement the user-referenced September 23
performance, reliability and cost plan in independently tested increments while
preserving authorization, accounting, provider selection and protocol behavior.

Source plan: `6ab3017e-3c28-83eb-ba57-26a0a7d16138` (Branch · Review routing PR).
No public contract, website, database or deployment change is made by this
baseline document.

## Verified starting point

- PR: https://github.com/phaseoteam/Phaseo/pull/2465
- Published head: `176f47c5d0a3d9d8e5053de8543015745eb11b9b`.
- Clean checkout: `E:/codex-managed-worktrees/gateway-pr-2465-restart/phaseo`.
- New branch: `perf/gateway-pr2465-restart-20260923/baseline`.
- Before this document, both HEAD and the working tree exactly matched the PR.
- GitHub reports merge conflicts. At inspection, the PR has three unique commits
  and remote main has 54 unique commits. Integration must preserve current main's
  schema, normalization, service-tier and execution changes.
- The previous worktree and all its dirty files remain untouched at
  `E:/codex-managed-worktrees/gateway-production-release/phaseo`.
- Preservation commit `f93e19711` and the uncommitted L1-cache implementation
  are **not** ancestors/content of this new baseline.

Only obsolete local stack grouping was removed. Old branches, worktrees, files
and the existing PR remain intact. Replacement grouping uses GitHub's native
`gh stack`: main → PR #2465 → this baseline. No new PR has been submitted and no
remote PR grouping, branch or deployment has been changed during this restart.

## Reassessment against the PR

The PR already contains cached-auth/completion-health hardening and coalescing
of unchanged routing-hint writes. These are the starting implementation, not
new work to recreate.

One unresolved, non-outdated review thread remains:
https://github.com/phaseoteam/Phaseo/pull/2465#discussion_r4060357309

The code still permits a late workspace-policy KV read to overwrite the local
version marker after a local version bump. Validate with a deterministic race
test, then fix in the PR's owning layer before broadening policy caching.
The existing freshness tests cover unknown/malformed markers and source failure,
but do not cover this interleaving.

The buffered-health helper also marks completion before acquiring its background
runtime. Reassess this and transport-error classification as part of the plan's
completion-outcome work; inspection alone does not establish a runtime failure.

## Revised execution order

1. Establish deterministic tests on the exact PR state. Reproduce and repair
   confirmed review findings in the owning layer; reconcile with current main.
2. Record an attributable baseline before changing architecture. The currently
   deployed staging Worker contains unpublished changes and is **not** this PR
   baseline. Do not reuse its speed/cost figures as measurements of this checkout.
3. Add bounded cache infrastructure and adopt it incrementally. Evaluate the
   preserved implementation selectively; do not cherry-pick the 40-file staging
   preservation commit wholesale.
4. Implement compact public snapshots and Cache API use, private/workspace/auth
   leases and mutation invalidation. Preserve absolute source deadlines and
   strict credit/key/policy behavior. Prove zero external control-plane reads
   for eligible warm requests; identify financial/hard-limit exceptions.
5. Implement memory-first health aggregation, bounded micro-batching, periodic
   checkpoints and background snapshots. Keep advisory health distinct from
   financial durability; remove redundant health KV traffic only after parity.
6. Implement streaming session/outcome handling, bounded framing, commitment and
   retry rules, cancellation and idempotent accounting using existing contracts.
7. Validate representative cost, latency and failure behavior. Production rollout
   and legacy-path deletion remain gated by the source plan's evidence requirements.

## Test and rollout rules

- Narrow deterministic tests per increment, then gateway source tests, types,
  lint, Worker build and native Workers concurrency/failure tests.
- Poolside probes go through the gateway using verified zero-priced routes,
  disposable test keys, bounded tokens and sample counts, with cleanup verified.
  Include streaming/non-streaming and supported Chat/Responses/Messages surfaces.
- Separate fresh-key, warm and fully cold behavior. Report region and sample size.
  Do not claim global SLOs or paid-accounting correctness from free UK probes.
- Keep staging's shared-production-database schedules disabled. No production
  deployment, wallet edit, credit-floor migration or paid load test is included
  in the restart itself.
- Old tests/results are reference evidence only until rerun on the actual new
  candidate. No API regression tests or live probes were run in this new checkout
  during the baseline-only restart.
