# Phaseo CLI

`@phaseo/cli` is the official command-line interface for Phaseo.

It gives you a first-party terminal workflow for:

- signing in with Phaseo through browser OAuth or device code
- inspecting your current identity and workspace grant
- creating and managing regular API keys and management keys
- managing workspaces, presets, settings, and guardrails
- creating and managing scoped third-party OAuth applications
- reading models, organisations, providers, endpoint families, pricing, credits, activity, analytics, and generations
- managing async webhook endpoints where Batch API access is enabled
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
phaseo update --check
phaseo update
phaseo doctor
phaseo doctor --json
```

- `phaseo --version` prints the installed CLI version.
- `phaseo version` prints the current version plus the update command for the package manager that owns the active installation.
- `phaseo update` updates that installation with the same package manager; `--check` only checks for a newer release.
- `phaseo doctor` shows the active executable and reports other Phaseo installations shadowed on `PATH`, with precise cleanup commands.
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

## Terminal output

Phaseo uses colour, visual status markers, and ephemeral spinners for long-running setup work in an interactive terminal. Spinners write to `stderr` and clear themselves when each operation completes. Non-TTY `stderr` and `TERM=dumb` disable animation; `NO_COLOR` disables colour. `--json` always emits decoration-free structured output suitable for agents and automation. Set `FORCE_COLOR=1` to retain colour when a terminal wrapper does not expose TTY support.

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
phaseo models get openai/gpt-5
phaseo providers list
phaseo organisations list
phaseo endpoints list
phaseo pricing models
phaseo credits get
phaseo activity list --days 7
phaseo logs list --since 1h --status error --json
phaseo logs get <request-id> --json
phaseo generation get --id <request-id>
phaseo webhooks list
phaseo webhooks create --url https://example.com/phaseo-events --events batch.completed --show-secret
phaseo api get /v1/models
```

## Coding-agent integrations

Install and configure a persistent coding integration with one command:

```bash
phaseo login
phaseo codex
phaseo claude-code
phaseo hermes
phaseo opencode
phaseo pi
phaseo prime-agent
phaseo deepseek-harness
phaseo openclaw
phaseo aider
phaseo roo-code
phaseo kilo-code
phaseo continue
phaseo cursor
phaseo zed
```

`phaseo <integration>` checks whether a first-party harness is installed when the integration supports managed installation. When it is missing in an interactive terminal, Phaseo shows the exact supported install command and asks for confirmation before running it. After installation, Phaseo creates a dedicated non-expiring gateway key and writes the integration configuration. Non-interactive runs fail with the install command instead of making an unattended system change. Use `--skip-install` when the harness is managed separately, or `--dry-run` to preview the installer and file changes. The explicit `phaseo setup <integration>` form remains supported for scripts and compatibility.

`phaseo claude` is an alias for `phaseo claude-code`, and `phaseo dsh` is an alias for `phaseo deepseek-harness`.

OpenCode, DeepSeek Harness, Pi, and Prime Agent receive every active Phaseo text model compatible with the OpenAI Chat Completions protocol. Select the initial model with `--model`, or use `--catalog default` when only that model should be configured:

```bash
phaseo opencode --model openai/gpt-5.6-terra
phaseo dsh --catalog default
```

The lower-level integration commands remain available for detection, credential retrieval, removal, and compatibility with existing scripts:

```bash
phaseo integrations list
phaseo integrations status codex
phaseo integrations credential codex
phaseo integrations remove codex
```

`phaseo integrations setup <integration>` remains accepted as a compatibility form, but new documentation should use `phaseo <integration>`.

## Ori-compatible harness runners

Phaseo can also launch Cline, Kilo Code, oh-my-pi, and Muse Code with the Phaseo gateway. The runner keeps the dedicated key in the child process environment, creates only temporary provider configuration, and removes that configuration when the harness exits:

```bash
phaseo cline --model openai/gpt-5.6-terra -- --tui
phaseo kilo --model openai/gpt-5.6-terra --
phaseo omp --model openai/gpt-5.6-terra --
phaseo muse --model meta/muse-spark-1.3 --
```

`phaseo run <cline|kilo|omp|muse>` is the equivalent explicit form. Put harness flags after `--` so Phaseo can consume its own flags first. Use `--catalog all` to fetch the active Phaseo text/chat model catalog, or `--dry-run --json` to inspect the install and launch plan without creating a key or starting a harness.

The first interactive run offers to install a missing Cline, Kilo Code, or oh-my-pi CLI. Muse Code uses Meta's installer on Unix-like systems; on Windows, install Muse Code separately, verify `muse --version`, and rerun with `--skip-install`. All four runners use isolated temporary provider state so existing user configuration is not overwritten.

Hermes setup is automatic and uses Hermes' supported plaintext `~/.hermes/.env` credential store. Phaseo CLI records the previous non-secret model settings so removal can restore them.

Codex receives a dedicated `phaseo` profile at `~/.codex/phaseo.config.toml`, leaving the default profile unchanged:

```bash
codex --profile phaseo
```

Setup creates one non-expiring gateway key per integration with a descriptive name such as `Phaseo CLI: Codex API Key`. The CLI retains each key in the OS credential store and revokes it when that integration is removed. Codex and Claude Code use credential helpers, so their application configuration never contains the key:

```bash
phaseo login
claude
```

OpenCode receives a `phaseo` provider in `~/.config/opencode/opencode.json` or an existing `opencode.jsonc`. Its dedicated key is stored in OpenCode's owner-only `auth.json` credential store, preserving credentials for other providers.

DeepSeek Harness receives a Phaseo provider and model catalog in `$DSH_HOME/cordis.patch.yml` (or `~/.dsh/cordis.patch.yml`). The managed block includes the Phaseo base URL and OpenAI Completions protocol while preserving unrelated Harness patches. Its dedicated key is written to Harness's `$DSH_HOME/.credentials.yaml` store with an ownership marker.

Pi receives a managed provider extension in `~/.pi/agent/extensions/phaseo.ts`. Prime Agent receives a managed provider in `~/.prime/agent/models.json`. Both load their dedicated keys from the Phaseo CLI at request time, so their configuration files contain no plaintext secrets.

Every setup operation supports `--dry-run`. Writes are transactional and roll back if setup fails; successful setup does not leave backup files behind. Remove only Phaseo-owned values with:

```bash
phaseo integrations remove codex
phaseo integrations remove claude-code
phaseo integrations remove opencode
phaseo integrations remove deepseek-harness
phaseo integrations remove pi
phaseo integrations remove prime-agent
```

## Local comparison runs

The CLI can execute a small model-and-case matrix from a local JSON file:

```bash
phaseo curie run ./examples/curie.example.json --dry-run
phaseo curie run ./examples/curie.example.json --report ./curie-report.json
```

The configuration supports multiple models, deterministic equals/contains/regular-expression checks, per-case parameters, repeated runs, custom OpenAI-compatible base URLs, and an API-key environment variable. Results include pass rate, request success, latency, token usage, and any cost reported by the endpoint.

The default endpoint is `https://api.phaseo.app/v1` and the default key variable is `PHASEO_API_KEY`. Custom endpoints require `--allow-custom-base-url` and use the isolated `PHASEO_CURIE_API_KEY` variable so a configuration cannot redirect your normal Phaseo credential.

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
