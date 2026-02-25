---
name: "yeet"
description: "Use only when the user explicitly asks to stage, commit, push, and open a GitHub pull request in one flow using the GitHub CLI (`gh`)."
---

## Prerequisites

- Require GitHub CLI `gh`. Check `gh --version`. If missing, ask the user to install `gh` and stop.
- Require authenticated `gh` session. Run `gh auth status`. If not authenticated, ask the user to run `gh auth login` (and re-run `gh auth status`) before continuing.

## Naming conventions

- Branch: `{description}` on a fresh branch from `origin/main` (or repo default branch), unless the user explicitly says to keep using the current branch.
- Commit: Prefer Conventional Commits (`type(scope): summary`) when possible.
  - Examples: `fix(data): restore venice provider model export`, `chore(data): refresh generated provider model mappings`
  - If scope is unclear, use `type: summary` (e.g. `chore: refresh provider model data`)
- PR title: `{description}` summarizing the full diff.

## Branch safety checks

- Detect default branch: `git remote show origin` (or fallback `main`).
- Detect current branch and open PR state:
  - `current=$(git branch --show-current)`
  - `gh pr list --head "$current" --state open --json number`
- If `current` is not the default branch and there is no open PR for it, do **not** continue on that branch by default.
- In that case, create a fresh branch from default, then continue:
  - `git fetch origin`
  - `git checkout -b "{description}" origin/{default}`
- Never reuse a stale branch tied to closed/merged work unless the user explicitly asks to.

## Workflow

- Start on a fresh branch from the default branch unless the user explicitly requests the current branch.
- Confirm status, then stage everything: `git status -sb` then `git add -A`.
- Commit using a Conventional Commit message when possible; if not possible, use a terse descriptive message:
  - Preferred: `git commit -m "fix(scope): short summary"`
  - Fallback: `git commit -m "{description}"`
- Run checks if not already. If checks fail due to missing deps/tools, install dependencies and rerun once.
- Push with tracking: `git push -u origin $(git branch --show-current)`
- If git push fails due to auth errors, fix authentication/credentials first, then retry the push.
- Open a PR and edit title/body to reflect the description and the deltas: `GH_PROMPT_DISABLED=1 GIT_TERMINAL_PROMPT=0 gh pr create --draft --fill --head $(git branch --show-current)`
- Write the PR description to a temp file with real newlines (e.g. pr-body.md ... EOF) and run pr-body.md to avoid \\n-escaped markdown.
- PR description (markdown) must be detailed prose covering the issue, the cause and effect on users, the root cause, the fix, and any tests or checks used to validate.
