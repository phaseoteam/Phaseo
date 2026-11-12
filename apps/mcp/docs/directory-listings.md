# Directory listings

Where the Phaseo MCP (`https://mcp.phaseo.app/mcp`) and the Phaseo plugin are listed,
what each directory needs, and the copy to submit. Requirements were checked on
2026-11-03; re-check each directory's docs before submitting, because several are in
preview.

| Directory | Route | State |
| --- | --- | --- |
| ChatGPT and Codex (OpenAI Plugins) | ZIP upload in the OpenAI platform | Package ready (`pnpm --filter @phaseo/mcp build:plugin`) |
| Claude (plugin and connector) | claude.ai/directory/manage | Ready: `phaseoteam/skills`, folder `plugins/phaseo` |
| Official MCP Registry | `MCP Registry publish` workflow | Ready once the DNS record and key exist |
| Cursor Marketplace | cursor.com/marketplace/publish | Ready: `.cursor-plugin/` in the plugin |
| Grok | x.ai/bot/marketplace/submit-a-plugin (same form as Cursor) | Grok listing is "coming soon" on the form |
| Google Connected Apps (Gemini, AI Mode) | connected.google.com/console | Verification route ready; category and token policy open |
| Meta Muse | platform.muse.ai | Copy below; the form needs a Meta login |
| Microsoft 365 Copilot Agent Store | Microsoft 365 Agents Toolkit, then Partner Center | Blocked on OAuth (see below) |
| AWS Marketplace, AI Agents and Tools | AWS Partner Central | Blocked on subscription handling (see below) |
| Salesforce AgentExchange | Salesforce Partner Console | No documented route for an external MCP server |

## Shared listing copy

- **Name:** Phaseo
- **One line:** Compare AI models and costs
- **Short description:** Find and compare AI models by live price, context and benchmarks,
  estimate costs, and check your Phaseo credits, usage and failed requests.
- **Website:** https://phaseo.app
- **Support:** https://phaseo.app/support
- **Privacy:** https://phaseo.app/privacy
- **Terms:** https://phaseo.app/terms
- **Logo:** `plugin/phaseo/assets/logo_plate.svg` (512×512, solid background),
  `logo_light.svg` and `logo_dark.svg` (transparent), or https://phaseo.app/png_logo_light.png
  (1024×1024 PNG).

Capabilities, one per line:

- Search current AI models by price, context window and input type
- Rank models on general, coding and agentic benchmarks
- Estimate what a workload costs on a specific model and provider
- Show your Phaseo credit balance and usage by model
- List recent failed requests with their status and latency

Example prompts:

- @Phaseo what are the cheapest text models with at least 128K context?
- @Phaseo how much would 2M input and 500K output tokens cost on Claude Sonnet 4.6?
- Show me with @Phaseo which models I have used most this month
- Use @Phaseo to list my failed requests from the last 7 days

The default connection is read-only. It returns the public catalogue and the signed-in
workspace's credits, aggregated usage and request metadata. It never returns prompts,
responses or credentials. Account management needs a separate connection
(`?access=manage`) and is not part of any directory listing.

### Reviewer account

Every directory asks for a test account. Create one Phaseo account for all reviewers:

- password sign-in only, with no MFA, magic link or email code;
- a few dollars of credits and at least a week of usage across two or three models;
- at least one failed request in the last 7 days, so the logs example has a result.

Enter the credentials only in each directory's dashboard. Never commit them.

## Official MCP Registry

Publishes `app.phaseo/phaseo` and `app.phaseo/docs` from `apps/mcp/registry/*/server.json`.
GitHub's MCP registry, VS Code, Glama and mcp.directory read from it.

1. Generate an Ed25519 key with OpenSSL 3:

   ```bash
   openssl genpkey -algorithm Ed25519 -out key.pem
   echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
   openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'
   ```

2. Add the first output as a TXT record on the apex `phaseo.app`.
3. Store the hex private key (the second output) as `MCP_REGISTRY_PRIVATE_KEY` on a GitHub
   environment named `mcp-registry-publish`, restricted to `main` with a required reviewer.
   Delete `key.pem` afterwards.
4. Run **MCP Registry publish** from `main` once per server.
5. Ask GitHub to list the servers in its MCP registry (github/github-mcp-server discussion
   #1257), claim the Glama listings with its `/.well-known/glama.json` file, and email
   mcp.directory for the verified badge.

Every published version is permanent. Bump `version` in `server.json` before publishing again.
The registry is in preview and may reset its data before general availability.

## Cursor Marketplace and Grok

`plugin/phaseo/.cursor-plugin/plugin.json` is the Cursor manifest. Cursor's schema rejects
unknown keys, so it is smaller than the other manifests. `.cursor-plugin/mcp.json` lists the
same servers with only their URLs. The `phaseoteam/skills` mirror also needs
`.cursor-plugin/marketplace.json` at its root, with `"source": "plugins/phaseo"`.

The Cursor form at cursor.com/marketplace/publish asks for the organisation name and handle
(`phaseo`), a contact email, the logo URL (the plate logo from the mirror), a description,
the public repository (`phaseoteam/skills`) and the website. The x.ai form is the same form
with Grok as an extra target. Cursor reviews every plugin and every update by hand. Its
publisher terms require listed plugins to be open source and free to use; Phaseo usage stays
billed by the user's own Phaseo account.

Test locally by copying the plugin to `~/.cursor/plugins/local/phaseo`, reloading Cursor and
signing in to both MCP servers. Cursor registers as a public OAuth client by DCR.

## Google Connected Apps

Google's Connected Apps platform lists MCP servers in Gemini and Google AI Mode. Requirements
(developers.google.com/connected-apps):

- **Domain verification:** set the downloaded file's contents as the
  `GOOGLE_CONNECTED_APPS_VERIFICATION` secret on the MCP Worker. It is served at
  `https://mcp.phaseo.app/.well-known/google-connected-apps`.
- **Listing:** one-sentence description under 30 words, a 512×512 PNG or JPEG icon under
  1 MB, at least 3 capabilities, at least 3 example prompts (2 starting with `@Phaseo`, 1 with
  it mid-sentence, no numbering or quotes), privacy and terms URLs, and a test account
  shared with `@gmail.com` testers.
- **Category:** permanent. There is no developer-tools category yet.
- **OAuth:** CIMD or DCR with PKCE S256; both are supported. Google asks servers not to rotate
  refresh tokens; Phaseo rotates them.
- **Tools:** every tool must be annotated (done) and returns its data as JSON text, because
  Google does not read `structuredContent`. MCP Apps are in beta and may be ignored.
- **Updates:** each published version freezes its tools. Changing a tool schema needs a new
  version and review.

## Meta Muse

Submit at platform.muse.ai. The form asks for an overview (users, tasks, restrictions),
business verification, a data-processing questionnaire, the endpoint with its auth set-up and
scopes, tool documentation and a test account.

- **Overview:** for developers and teams building with AI models. It answers current questions
  about model prices, context windows and benchmark results, and shows the user's own Phaseo
  credits, usage and failed requests. A Phaseo account is required; there are no region limits.
- **Tools:** every listed tool is a read. `inference_quote` and `inference_run` are app-only:
  the model cannot call them, and runs happen only after the user presses Run in the explorer.
- **Data:** tools return catalogue data and the workspace's own aggregated usage and request
  metadata, never prompt or response content. Answers must match https://phaseo.app/privacy.
- **Auth:** OAuth 2.1 with PKCE, DCR and CIMD, read-only scopes by default.

Meta's terms let it use connector interactions to improve Muse. Read them before submitting.

## Blocked directories

- **Microsoft 365 Copilot:** Copilot's DCR needs the authorization server to issue a client
  secret, but Phaseo's DCR only creates public clients. The alternative is a static
  confidential OAuth client registered in the Teams Developer Portal with the redirect
  `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`. It also needs a Partner
  Center account, publisher verification and a Copilot-licensed test tenant.
- **AWS Marketplace:** a free listing still needs seller registration (company, tax ID) and
  SaaS subscription handling (a registration page and EventBridge subscription events). The
  one-click AgentCore option needs the OAuth `client_credentials` grant, which Phaseo does not
  offer.
- **Salesforce AgentExchange:** listings are for managed packages and Salesforce API
  products. Salesforce has announced MCP tool listings but not published how to submit one.
  Ask the partner team first.
