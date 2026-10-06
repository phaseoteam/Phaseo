# Phaseo desktop foundation

This folder is a Git subtree of T3 Code, pinned in PHASEO-FORK.json. Preserve LICENSE and third-party notices. Package names and internal protocol identifiers stay upstream-compatible to minimise merge conflicts.

## Development

Requires Node 24 and pnpm 11 (packageManager pins the exact version). This is an independent nested workspace; do not install its packages into the outer Phaseo workspace. It references the canonical Phaseo SDK packages in ../../packages/sdk. The development launcher and server bundle build compile those SDKs and the bundled harness first.

From apps/desktop-new:

- `pnpm install`
- `pnpm dev:phaseo` for desktop, or `pnpm dev:phaseo:web` for server and web.

Phaseo development uses this folder's ignored .phaseo state. Electron uses a separate Phaseo profile and never migrates an existing T3 profile. T3-hosted account, relay configuration and release updates are disabled. Connect CLI and sidebar sign-in are removed. Local provider authentication and direct connections remain.

## Upstream updates

`pnpm upstream:check [tag-or-branch]` fetches upstream without changing source. `pnpm upstream:update <tag-or-branch>` requires a clean repository and merges a squash subtree update. Resolve conflicts normally, record the new revision in PHASEO-FORK.json, and rerun focused builds/tests. Updates are reviewed manually; nothing automatically replaces Phaseo changes or publishes releases.

The remote is https://github.com/pingdotgg/t3code.git. The initial import retains subtree merge ancestry; do not replace this folder with a filesystem copy.

## Scope

Removed: upstream reference-repo snapshots, marketing/mobile apps, hosted relay deployment and upstream GitHub release workflows. Shared relay contracts remain where direct connection/orchestration code depends on them.

## Phaseo gateway

In Settings → Providers, add Phaseo and choose Sign in to Phaseo. Complete the browser authorization. New accounts use the bundled Phaseo harness; no external agent installation is needed. Phaseo models then appear in the chat model selector. Accounts are separate provider instances; disconnecting one stops its sessions and removes its credential.

Phaseo uses the existing desktop PKCE OAuth client and a loopback callback on the desktop's machine. Credentials remain on the backend. The catalog includes routable text models, follows all pages, and refreshes in the background every ten minutes while the app is active. The last catalog stays visible during revalidation.

The Phaseo harness reuses the original desktop Agent SDK runtime for streamed text and reasoning, project tools, approvals, instructions, skills and MCP. T3's ACP adapter manages chat sessions, restart recovery, branching and scoped orchestration tools for child chats and provider delegation. Native SDK subagent tracking and context compaction are not implemented.

Settings → Providers → Phaseo → Harness also offers Codex against Phaseo's Responses endpoint. Existing gateway accounts retain Codex until changed, preserving their previous behavior. It does not use a ChatGPT subscription or inherit its credential. Model-specific tool and reasoning support depends on the selected gateway model. This sign-in flow is intended for the local desktop, not a browser controlling a different machine.

## Gateway attribution

Desktop inference sends `HTTP-Referer: https://phaseo.app/desktop`, `X-App-Id: phaseo-desktop`, and the title/name Phaseo Desktop. App identity is scoped by gateway workspace and normalized referrer URL; the desktop page path keeps it separate from the web application.

Chat inference uses the persisted application chat ID as `X-Session-Id`. The native harness also sends `session_id` in Responses requests, with its durable ACP session ID as the fallback outside T3. Reopening keeps the same ID; a child chat or branch uses its own ID. Codex receives per-thread header overrides on start, resume and fork. One-shot product helpers have application attribution without pretending to belong to a chat.
