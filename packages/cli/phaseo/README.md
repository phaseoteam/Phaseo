# Phaseo CLI

`@phaseo/cli` is the official command-line interface for Phaseo.

It gives you a first-party terminal workflow for:

- signing in with Phaseo through browser OAuth or device code
- inspecting your current identity and workspace grant
- creating and managing regular API keys and management keys
- managing workspaces, presets, settings, and guardrails
- creating and managing scoped third-party OAuth applications
- reading models, providers, pricing, credits, activity, analytics, and generations
- falling back to a raw authenticated API command when you need an endpoint before a polished subcommand exists

## Install

```bash
npm install -g @phaseo/cli
pnpm add -g @phaseo/cli
yarn global add @phaseo/cli
bun add -g @phaseo/cli
```

## Version and Updates

```bash
phaseo --version
phaseo version
phaseo version --json
```

- `phaseo --version` prints the installed CLI version.
- `phaseo version` prints the current version plus the recommended install/update command for the detected package manager.
- interactive CLI commands also check for newer published versions and show an update hint when one is available.
- set `PHASEO_DISABLE_UPDATE_CHECK=1` if you want to suppress automatic update notices.

Update commands:

```bash
npm install -g @phaseo/cli@latest
pnpm add -g @phaseo/cli@latest
yarn global add @phaseo/cli@latest
bun add -g @phaseo/cli@latest
```

## Quick Start

```bash
phaseo login
phaseo whoami --json
phaseo keys create --name "Local CLI Key" --json
```

`phaseo login` supports both:

- `Sign in with Phaseo`: authorization code + PKCE with a loopback callback
- `Sign in with Device Code`: best for SSH, CI, and remote shells

Local interactive terminals default to browser sign-in. SSH, CI, and non-interactive flows automatically prefer device code. You can always force either path:

```bash
phaseo login --browser
phaseo login --device-code
```

All commands support `--help`, and most commands support `--json` for agent-friendly output.

## Common Commands

```bash
phaseo login
phaseo logout
phaseo whoami

phaseo keys current
phaseo keys list
phaseo keys create --name "Codex"

phaseo workspaces list
phaseo workspaces members <workspace>
phaseo workspaces add-members <workspace> --user-ids <user-id,user-id>

phaseo presets list
phaseo settings get

phaseo guardrails list
phaseo guardrails create --name "Production Safety" --body-json '{"enabled":true}'
phaseo guardrails add-keys <guardrail-id> --key-ids <key-id,key-id>
phaseo guardrails add-members <guardrail-id> --user-ids <user-id,user-id>

phaseo management-keys create --name "Raycast" --template raycast-readonly
phaseo models list --limit 20
phaseo providers list
phaseo pricing models
phaseo credits get
phaseo activity list --days 7
phaseo logs list --since 1h --status error --json
phaseo logs get <request-id> --json
phaseo generation get --id <request-id>
phaseo api get /v1/models
```

## OAuth and OAuth Apps

The CLI sits on top of the shared Phaseo OAuth/OIDC stack, not a CLI-only auth path. That means the same foundations power:

- first-party CLI login
- device-code approval
- user-created third-party OAuth apps
- dynamically registered MCP clients
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
- `GET /.well-known/oauth-authorization-server/oauth`
- `GET /oauth/.well-known/jwks.json`
- `POST /oauth/register`

Supported grants:

- device code
- authorization code with required PKCE `S256`
- refresh token

First-party CLI sessions use short-lived access tokens and rotating refresh tokens. User-created applications and MCP clients use authorization code with PKCE, exact redirect URIs, explicit workspace consent, stored scopes, revocable delegated access tokens, and optional protected-resource binding.

### Local OAuth end-to-end test

Run the local web app at `http://localhost:3100` and the API Worker at
`http://127.0.0.1:8790`, with the API configured to use the local web origin.
Keep the test CLI session isolated from your normal Phaseo session:

```powershell
$env:PHASEO_CONFIG_DIR = "$env:TEMP\phaseo-oauth-e2e"
node ./dist/index.js login --browser --api-url http://127.0.0.1:8790
node ./dist/index.js whoami --json
```

Create a temporary public client with the smoke callback registered:

```powershell
node ./dist/index.js oauth-clients create `
  --name "Local OAuth smoke test" `
  --client-type public `
  --redirect-uri http://127.0.0.1:8977/callback `
  --scopes openid,profile,email,gateway:access,me:read `
  --json
```

Pass the returned client ID to the smoke client. It performs S256 PKCE, checks
`userinfo`, revokes the delegated credential, and verifies that reuse fails. It
never prints the access token:

```powershell
pnpm smoke:oauth-client -- `
  --api-url http://127.0.0.1:8790 `
  --client-id <client-id>
```

Delete the temporary OAuth client and run `logout` when finished. Confidential
clients are also supported; provide their one-time secret through the
`PHASEO_OAUTH_CLIENT_SECRET` environment variable rather than a command-line
argument.

## Security Notes

- CLI sessions prefer OS-backed storage where possible:
  - Windows: DPAPI-protected local blob
  - macOS: Keychain
  - Linux: Secret Service via `secret-tool`
- `phaseo logout` revokes the stored refresh token before clearing local state.
- Management keys use `phaseo_v1_mk_` and require explicit scopes; `phaseo_v1_sk_` keys are inference-only.
- Regular inference/API keys are policy- and guardrail-driven rather than scope-driven.

Override behavior when needed:

- `PHASEO_CONFIG_DIR` changes the config/session directory
- `PHASEO_SESSION_BACKEND=file` explicitly opts into plain-file session storage when an OS credential store is unavailable. This stores refresh tokens on disk and should be used only when you accept that tradeoff.
- `PHASEO_API_URL` points the CLI at a different API host

## Local Validation

```bash
pnpm --filter @phaseo/cli build
pnpm --filter @phaseo/cli test
node packages/cli/phaseo/dist/index.js --help
node packages/cli/phaseo/dist/index.js --version
node packages/cli/phaseo/dist/index.js version --json

pnpm run validate:api
pnpm --filter @phaseo/web typecheck
```
