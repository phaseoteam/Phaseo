# AI Stats CLI

`@ai-stats/cli` is the official command-line interface for AI Stats.

It gives you a first-party terminal workflow for:

- signing in with AI Stats through browser OAuth or device code
- inspecting your current identity and workspace grant
- creating and managing regular API keys and management keys
- managing workspaces, presets, settings, guardrails, and OAuth apps
- reading models, providers, pricing, credits, activity, analytics, and generations
- falling back to a raw authenticated API command when you need an endpoint before a polished subcommand exists

## Install

```bash
npm install -g @ai-stats/cli
pnpm add -g @ai-stats/cli
yarn global add @ai-stats/cli
bun add -g @ai-stats/cli
```

## Version and Updates

```bash
aistats --version
aistats version
aistats version --json
```

- `aistats --version` prints the installed CLI version.
- `aistats version` prints the current version plus the recommended install/update command for the detected package manager.
- interactive CLI commands also check for newer published versions and show an update hint when one is available.
- set `AI_STATS_DISABLE_UPDATE_CHECK=1` if you want to suppress automatic update notices.

Update commands:

```bash
npm install -g @ai-stats/cli@latest
pnpm add -g @ai-stats/cli@latest
yarn global add @ai-stats/cli@latest
bun add -g @ai-stats/cli@latest
```

## Quick Start

```bash
aistats login
aistats whoami --json
aistats keys create --name "Local CLI Key" --json
```

`aistats login` supports both:

- `Sign in with AI Stats`: authorization code + PKCE with a loopback callback
- `Sign in with Device Code`: best for SSH, CI, and remote shells

Local interactive terminals default to browser sign-in. SSH, CI, and non-interactive flows automatically prefer device code. You can always force either path:

```bash
aistats login --browser
aistats login --device-code
```

All commands support `--help`, and most commands support `--json` for agent-friendly output.

## Common Commands

```bash
aistats login
aistats logout
aistats whoami

aistats keys current
aistats keys list
aistats keys create --name "Codex"

aistats workspaces list
aistats workspaces members <workspace>
aistats workspaces add-members <workspace> --user-ids <user-id,user-id>

aistats presets list
aistats settings get

aistats guardrails list
aistats guardrails create --name "Production Safety" --body-json '{"enabled":true}'
aistats guardrails add-keys <guardrail-id> --key-ids <key-id,key-id>
aistats guardrails add-members <guardrail-id> --user-ids <user-id,user-id>

aistats oauth-clients list
aistats oauth-clients create --name "My App" --redirect-uri "http://127.0.0.1:8789/callback"
aistats oauth-clients regenerate-secret <client-id>

aistats management-keys create --name "Automation"
aistats models list --limit 20
aistats providers list
aistats pricing models
aistats credits get
aistats activity list --days 7
aistats generation get --id <request-id>
aistats api get /v1/models
```

## OAuth and OAuth Apps

The CLI sits on top of the shared AI Stats OAuth/OIDC stack, not a CLI-only auth path. That means the same foundations power:

- first-party CLI login
- device-code approval
- future and current user-created OAuth apps
- `userinfo`, token, revoke, consent, and JWKS/discovery flows

Implemented OAuth endpoints:

- `GET /oauth/authorize`
- `POST /oauth/authorize/approve`
- `POST /oauth/device/code`
- `POST /oauth/device/activate`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /oauth/userinfo`
- `GET /oauth/.well-known/openid-configuration`
- `GET /oauth/.well-known/jwks.json`

Supported grants:

- device code
- authorization code with required PKCE `S256`
- refresh token

You can create and manage your own OAuth apps from the CLI:

```bash
aistats oauth-clients create \
  --name "My App" \
  --client-type confidential \
  --redirect-uri "http://127.0.0.1:8789/callback" \
  --scopes "openid,profile,email,me:read,guardrails:write"
```

## Security Notes

- CLI sessions prefer OS-backed storage where possible:
  - Windows: DPAPI-protected local blob
  - macOS: Keychain
  - Linux: Secret Service via `secret-tool`
- `aistats logout` revokes the stored refresh token before clearing local state.
- Management keys now require explicit scopes; legacy empty-scope management keys are rejected.
- Regular inference/API keys are policy- and guardrail-driven rather than scope-driven.

Override behavior when needed:

- `AI_STATS_CONFIG_DIR` changes the config/session directory
- `AI_STATS_SESSION_BACKEND=file` forces plain file storage
- `AI_STATS_API_URL` points the CLI at a different API host

## Local Validation

```bash
pnpm --filter @ai-stats/cli build
pnpm --filter @ai-stats/cli test
node packages/cli/aistats/dist/index.js --help
node packages/cli/aistats/dist/index.js --version
node packages/cli/aistats/dist/index.js version --json

pnpm run validate:api
pnpm --filter @ai-stats/web typecheck
```
