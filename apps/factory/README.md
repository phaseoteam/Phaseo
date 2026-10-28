# Phaseo Factory

A desktop work queue for coding agents. Factory lists a repository's issues and pull requests, moves each through
stages (Triage → Reproduce → Fix → Review → Verify), and runs every stage with an agent you choose. Agents run on the
subscriptions already signed in on your computer (Claude, Codex), through a local hub, or on Phaseo API credits.

It is separate from `apps/desktop` and shares its design tokens and UI primitives.

## Run it

```sh
pnpm --filter @phaseo/factory dev            # live GitHub data via the gh CLI
pnpm --filter @phaseo/factory dev -- --demo  # fixture data
pnpm --filter @phaseo/factory screenshot     # build, then write demo screenshots in both themes to ./screenshots
pnpm --filter @phaseo/factory package        # build, then make a runnable app and its release zip in ./out
```

From an agent shell, unset `ELECTRON_RUN_AS_NODE` first.

## How it works

- `src/main/github.ts` reads and changes issues and pull requests through the `gh` CLI, as the account it's signed in
  to: the activity timeline, files and review threads, checks, comments, reviews, merges and edits.
- `src/main/claude.ts` runs Claude through the Agent SDK, on the Claude Code it ships with, keeping Claude Code's
  own system prompt and settings. Subscription runs leave out `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and
  `ANTHROPIC_BASE_URL`, so they always use the plan Claude Code is signed in with. Codex runs as `codex exec --json`.
- `src/main/runner.ts` gives each work item its own git worktree. Pull requests are checked out as `factory/pr-N`
  (never over a branch of yours), catch up to their latest commits before each stage, and get fixes pushed to their
  own branch, or their fork's when its author allows it. Read-only stages get no write tools.
- `src/main/store.ts` keeps what Factory adds to GitHub (assignees, Autopilot, stage results, runs, notes, chats) in
  `<userData>/factory.json`, saved atomically with a `.bak`. Runs cut short by Factory closing or crashing, or by an
  agent crashing, carry on by themselves on the same session and worktree.
- `src/shared/stages.ts` holds the stage briefs (Playbooks) and the prompt.

## Releasing

Releases are GitHub releases of this repository, tagged `@phaseo/factory@<version>` like the other packages'. A
running Factory reads the repository's releases (it's public, so no sign-in is needed), keeps the ones with that
prefix, and shows the newest above its own version in the top bar and on Settings → General, with its notes and this
computer's download.

1. Bump `version` in `apps/factory/package.json`.
2. On each platform, run `pnpm --filter @phaseo/factory package`. It writes
   `out/Phaseo-Factory-<version>-<win|mac|linux>-<arch>.zip`; the platform and architecture in the name are how
   Factory picks its own download.
3. Create the release with the zips attached:
   `gh release create "@phaseo/factory@<version>" out/*.zip --title "Phaseo Factory <version>" --notes-file notes.md`.
   Mark it a pre-release to keep it from people on the stable version.

There's no installer, code signing or one-click install yet: people download the zip and replace the old folder.
Their settings and runs live in their user data folder, so they carry over. Builds are unsigned on purpose for now, so
Windows shows "Windows protected your PC" the first time; say in the release notes to choose More info → Run anyway.
When signing is wanted, Azure Artifact Signing (as the company, about $10 a month) is the cheapest route.

## Not built yet

Installers, signing and installing an update from inside the app (electron-builder and electron-updater, reading
the release this check finds); macOS and Linux haven't been tried. The Phaseo API runner, real subscription usage
windows, editable playbooks, and Linear, Sentry and Jira sources are still to come.
