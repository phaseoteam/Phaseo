# Phaseo desktop foundation

This folder is a Git subtree of T3 Code, pinned in PHASEO-FORK.json. Preserve LICENSE and third-party notices. Package names and internal protocol identifiers stay upstream-compatible to minimise merge conflicts.

## Development

Requires Node 24 and pnpm 11 (packageManager pins the exact version). This is an independent nested workspace; do not install its packages into the outer Phaseo workspace.

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

In Settings → Providers, add Phaseo and choose Sign in to Phaseo. Complete the browser authorization and install the agent runtime if prompted. Phaseo models then appear in the chat model selector. Accounts are separate provider instances; disconnecting one stops its sessions and removes its credential.

Phaseo uses the existing desktop PKCE OAuth client and a loopback callback on the desktop's machine. Credentials remain on the backend. The catalog includes routable text models, follows all pages, and refreshes in the background every ten minutes while the app is active. The last catalog stays visible during revalidation.

The Codex harness runs against Phaseo's Responses endpoint with its own profile, preserving T3's tool, approval and orchestration flow. It does not use a ChatGPT subscription or inherit its credential. Model-specific tool and reasoning support depends on the selected gateway model. This sign-in flow is intended for the local desktop, not a browser controlling a different machine.
