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
phaseo credits add --amount 20          # needs: phaseo login --scopes billing:write
phaseo credits topups get <id>
phaseo activity list --days 7
phaseo logs list --since 1h --status error --json
phaseo logs get <request-id> --json
phaseo generation get --id <request-id>
phaseo webhooks list
phaseo webhooks create --url https://example.com/phaseo-events --events batch.completed --show-secret
phaseo api get /v1/models
```

## Workspace management

Every `/v1` management area has its own command group, so agents can run a whole workspace from the CLI. Run `phaseo <group> --help` for exact flags.

| Group | Covers |
| --- | --- |
| `byok` | Bring-your-own provider keys: list, create, get, update, delete, reorder |
| `budgets`, `department-budgets` | Workspace and department spend limits |
| `spend-rules`, `spend-blocks` | Alert and block rules (with test, preview, history) and active blocks (list, lift) |
| `rate-limits policies`, `rate-limits assignments` | Rate limit policies and where they apply |
| `observability` | Logging policy and broadcast destinations |
| `notifications` | Billing and alert settings (including auto top-up), destinations, event routes |
| `routing dynamic-routes` | Dynamic routes, their keys, and version deploys |
| `private-models`, `classifiers`, `data-contribution` | Private model endpoints, request classifiers, data contribution |
| `presets` | Versions, labels, fork, upstream sync, publisher handle (plus the basic CRUD above) |
| `workspaces` | Member roles, invites, join requests (plus the basic CRUD above) |
| `identity` | SSO, SCIM and SCIM tokens, directory, departments, group mappings |
| `workload-identity policies` | Trusted workload policies |
| `keys`, `webhooks`, `analytics` | Key rotation and cache invalidation, webhook test events, CSV analytics export (plus the commands above) |
| `events` | Custom observability events (list, create) |
| `audit-events`, `apps` | Audit log and app attribution (list, update, merge) |
| `feedback`, `preset-test-runs` | Feedback records and preset test runs (`feedback`, `events` and `preset-test-runs` need `feedback:*` scopes) |

```bash
printf '%s' "$OPENAI_KEY" | phaseo byok create --provider openai --name "Prod" --key-stdin --json
phaseo budgets create --interval monthly --limit 500 --json
phaseo spend-rules create --name "80% alert" --metric budget_percent --threshold-percents 80 --destination-ids <id> --json
phaseo rate-limits assignments create --policy <id> --target-type key --target <key-id> --json
phaseo notifications settings update --low-balance-email true --low-balance-threshold-usd 10 --json
phaseo routing dynamic-routes deploy <route-id> 3 --json
phaseo workspaces invites create <workspace> --role member --max-uses 5 --show-secret
phaseo spend-blocks lift <block-id> --yes --json
```

Secrets never go on the command line, including inside `--body-json`. BYOK keys come from `--key-stdin`, `--key-env <VAR>`, or `PHASEO_BYOK_KEY`; private model credentials from `--credential-stdin`, `--credential-env <VAR>`, or `PHASEO_PRIVATE_MODEL_CREDENTIAL`. Webhook notification targets can be piped with `--target-stdin`. Observability destination configs usually hold credentials, so pass them with `--config-stdin` or `--config-env <VAR>` rather than `--config-json`. One-time secrets in responses (SCIM tokens, invite tokens, signing secrets) are hidden in human output unless you pass `--show-secret`; `--json` always returns them.

Commands that show `[--yes]` (delete, revoke, lift, rotate-secret, merge) ask before they run in an interactive terminal. In scripts, or with `--json`, they fail unless `--yes` is passed.

Scopes: the default login covers every group except `feedback` and `preset-test-runs`, which need `feedback:read` and `feedback:write`. Request them with an explicit list, for example `phaseo login --scopes <default scopes>,feedback:read,feedback:write`. Sessions signed in before the CLI could be granted the BYOK and private model scopes do not have them, so `byok` and `private-models` return `403` until you run `phaseo login` again. The `scope` field of `phaseo login --json` shows what was granted.

### Account, routing, and workspace settings

```bash
phaseo profile update --display-name "Ada Lovelace"
phaseo authorized-apps list
phaseo authorized-apps revoke <authorization-id> --yes
phaseo invites accept <invite-code>
phaseo invites requests --status all
phaseo rate-limits tier get
phaseo routing auto update --allowed-patterns "openai/*,anthropic/*" --objective cost
phaseo routing successors set --model openai/gpt-4 --successor openai/gpt-5
phaseo observability destinations test <destination-id>
phaseo keys update <key-id> --ip-allowlist "Office=203.0.113.0/24,VPN=2001:db8::1"
```

`profile`, `authorized-apps` and `invites` act as the signed-in person, so they need an OAuth login rather than a management key. `rate-limits tier raise` is for the workspace owner only.

`phaseo classifiers test` sends a real, billed model request with your session's own credential, so the session needs `gateway:access` as well as `classifiers:write`. The CLI sign-in cannot be granted `gateway:access` today, so the command returns `403 gateway_access_required` until it can; the dashboard's classifier test still works.

```bash
echo "Why was I charged twice?" | phaseo classifiers test <classifier-id> --prompt-stdin
```

## Adding credits

`phaseo credits add --amount <usd>` starts a top-up of $5 to $500 for the workspace. Nothing is charged until a person approves it:

- With a saved card, every workspace owner and admin gets an email with a single-use link, and one of them confirms or declines the charge on Phaseo.
- Without one, the command prints a checkout link where an owner or admin pays with a new card, which is saved for later top-ups.

The command waits until the top-up is paid, declined, expired (after 30 minutes) or failed. Use `--no-wait` to return straight away and `phaseo credits topups get <id>` to check later. It needs the opt-in `billing:write` scope: `phaseo login --scopes billing:write` keeps the default scopes and adds it.

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

`phaseo <integration>` checks whether a first-party harness is installed when the integration supports managed installation. When it is missing in an interactive terminal, Phaseo shows the exact supported install command and asks for confirmation before running it. After installation, Phaseo creates a dedicated gateway key (90-day expiry, $100 monthly spend limit) and writes the integration configuration. Non-interactive runs fail with the install command instead of making an unattended system change. Use `--skip-install` when the harness is managed separately, or `--dry-run` to preview the installer and file changes. The explicit `phaseo setup <integration>` form remains supported for scripts and compatibility.

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

## Isolated CLI harness runners

Phaseo can also launch Cline, Kilo Code, oh-my-pi, Muse Code, and MiniMax Code with the Phaseo gateway. The runner keeps the dedicated key in the child process environment, creates only temporary provider configuration, and removes that configuration when the harness exits:

```bash
phaseo cline --model openai/gpt-5.6-terra -- --tui
phaseo kilo --model openai/gpt-5.6-terra --
phaseo omp --model openai/gpt-5.6-terra --
phaseo muse --model meta/muse-spark-1.3 --
phaseo minimax --model openai/gpt-5.6-terra --
```

`phaseo run <cline|kilo|omp|muse|minimax>` is the equivalent explicit form. Put harness flags after `--` so Phaseo can consume its own flags first. Use `--catalog all` to fetch the active Phaseo text/chat model catalog, or `--dry-run --json` to inspect the install and launch plan without creating a key or starting a harness.

The first interactive run offers to install a missing Cline, Kilo Code, or oh-my-pi CLI. Muse Code and MiniMax Code use their official installers when the command is missing. MiniMax Code uses the official PowerShell installer on Windows. All five runners use isolated temporary provider state so existing user configuration is not overwritten.

Hermes setup is automatic and writes the key to Hermes' supported plaintext `~/.hermes/.env` credential store directly, so the key never appears in a command line. `HERMES_HOME` is honoured, with `~` and environment variables expanded. The key goes in a block between `# >>> phaseo managed (do not edit)` and `# <<< phaseo managed`; Phaseo never edits other lines, and setup refuses if `OPENAI_API_KEY` is already defined outside that block. Phaseo only edits the file when it has LF or CRLF line endings and every line is a full-line comment (any text), or is blank or a single-line `NAME=value` assignment in printable ASCII (optionally with `export`; the value unquoted without spaces, or in single or double quotes without escapes). Otherwise it does not edit the file at all and tells you which line to add or remove by hand; `phaseo integrations credential hermes` prints the key. The file is replaced atomically with a private (0600) file, and setup refuses a symbolic link in place of the file or its directory. A bare `OPENAI_API_KEY` line written by an earlier Phaseo version is moved into the block when it matches the stored key; otherwise Phaseo leaves it and tells you. Phaseo CLI records the previous non-secret model settings and the `.env` path it wrote, so removal restores the settings and removes the key from that same file. Running setup again on a Hermes install that Phaseo already manages rewrites the key and model settings.

Each integration gets its own key. Keys created by setup expire after 90 days and have a $100 monthly spend limit (raise it with `phaseo keys update <id> --limit <usd>`). When a stored key has expired, a new one is created the next time it is needed. Integrations that fetch the key on demand (Codex, Claude Code, Pi, Prime Agent, OpenClaw) pick it up automatically. Integrations that store the key in their own files (Aider, Continue, Hermes, OpenCode, DeepSeek Harness) need `phaseo setup <integration>` again to write it; `phaseo integrations credential` only prints the key. Keys created before keys expired are kept as they are. To rotate a key at any time, run `phaseo integrations remove <integration>` and then `phaseo setup <integration>`.

Codex receives a dedicated `phaseo` profile at `~/.codex/phaseo.config.toml`, leaving the default profile unchanged:

```bash
codex --profile phaseo
```

Setup creates one gateway key per integration with a descriptive name such as `Phaseo CLI: Codex API Key`. Each key expires after 90 days. The CLI retains each key in the OS credential store and revokes it when that integration is removed. Codex and Claude Code use credential helpers, so their application configuration never contains the key:

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
node ./dist/index.js login --browser --api-url http://127.0.0.1:8790   # loopback needs no extra flag
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
  - macOS: a random 32-byte data key in the Keychain (written through `security` on stdin), with the session encrypted with AES-256-GCM in a private file in the config directory. Sessions stored whole in the Keychain by older versions move to this format on first read. If the Keychain cannot store the key, login fails rather than putting the session in a command line.
  - Linux: Secret Service via `secret-tool`
- `phaseo logout` revokes the stored refresh token and integration keys before clearing local state. Signing in again keeps integration keys only when the API, account and workspace are the same, so they can still be revoked later; otherwise they are revoked with the previous session first, and any that could not be revoked are reported.
- `phaseo login` only signs in to `https://api.phaseo.app` or a loopback development API unless you pass `--allow-custom-api-url` (or set `PHASEO_ALLOW_CUSTOM_API_URL=1`). It then prints the host, and `phaseo whoami` shows it while the session is active.
- Links returned by the API, such as top-up checkout links, open in a browser only when they are `https://` links on `phaseo.app` or a subdomain; otherwise the CLI prints them.
- On Windows, package managers are run from their absolute path on `PATH`, never from the current directory.
- Management keys use `phaseo_v1_mk_` and require explicit scopes; `phaseo_v1_sk_` keys are inference-only.
- Regular inference/API keys are policy- and guardrail-driven rather than scope-driven.

Override behavior when needed:

- `PHASEO_CONFIG_DIR` changes the config/session directory
- `PHASEO_SESSION_BACKEND=file` explicitly opts into plain-file session storage when an OS credential store is unavailable. This stores refresh tokens on disk and should be used only when you accept that tradeoff.
- `PHASEO_API_URL` points the CLI at a different API host (login to a host other than `api.phaseo.app` or loopback also needs `--allow-custom-api-url` or `PHASEO_ALLOW_CUSTOM_API_URL=1`)

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
