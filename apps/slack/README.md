# Phaseo Slack agent Worker

The Cloudflare Worker behind the Phaseo Slack agent (`slack.phaseo.app`). It
receives Slack events and button clicks, decides who may get an answer, runs
one turn at a time per Slack thread, and answers through the Phaseo gateway.
Installing, settings and the month-end charge live in `apps/web-api`; this
Worker reads the same tables.

## Routes

| Route | What it is |
|---|---|
| `POST /events` | Events API request URL for the hosted Phaseo app. |
| `POST /events/:appId` | Events API request URL for a company's own Slack app (`:appId` is its Slack app id, `A...`). Its signing secret is read from `slack_apps`. |
| `POST /interactions`, `POST /interactions/:appId` | Interactivity request URL (Cancel, Connect account, feedback). |
| `GET /health` | Liveness. |

Every Slack request is checked against its v0 signature over the raw body, with
a five-minute window, and acknowledged at once. The work runs after the response,
because Slack wants an answer within three seconds. Retries are acknowledged and
deduped by event id.

**Removed in Slack.** When an admin removes the app inside Slack (`app_uninstalled`),
or its bot token is revoked (`tokens_revoked` listing the bot user), the Worker
calls `uninstall_slack_agent_from_slack`. In one transaction it deletes the
installation's gateway key, marks the installation uninstalled, removes its
guardrail and records `slack_agent.uninstalled_in_slack` in the audit log, in
the same order as Uninstall in Phaseo settings. The Worker handles this event
before answering Slack, so a database failure returns 500 and Slack retries it.
Repeats are safe, and an event older than the current install is ignored. The
app's manifest must subscribe to both events.

Refusals are recorded in the workspace audit log (`slack_agent.answer_refused`).
Nothing pushes or emails them yet, so replies never say an admin has been told.

## Durable Objects

- `ThreadCoordinator` (`THREADS`), one per `installation:channel:thread_ts`.
  - Dedupes event ids.
  - Runs one turn at a time and queues follow-ups.
  - Holds the cancel flag.
  - Keeps working memory: the bot's replies and short tool summaries.
  - Deletes everything 7 days after the last activity.
- `WorkspaceMeter` (`METERS`), one per installation.
  - Admits or refuses each answer: bots, Slack Connect users, guests, status, the plan's people, max people, the monthly spending cap and answers per person per hour.
  - Counts this UTC month's people and answers. An answer counts in the month it was admitted in, even when it finishes after midnight.
  - Flushes running totals to `record_slack_agent_people` at most about once a minute.
  - Serialises bot token refreshes when Slack rotates tokens.

Both use SQLite storage. Neither keeps Slack text longer than 7 days, and logs
carry ids and statuses only, as Slack's API terms require.

## Agent turns

Each answer is an `AgentTurnWorkflow` instance (`AGENT_TURNS`, Cloudflare
Workflows), one per Slack event, kept for 1 day. It has five steps:

1. `load`: re-checks the installation and access. It sets the Slack session to `processing` (`agents.sessions.setStatus`).
2. `context`: reads up to 15 messages of the thread (`conversations.replies`). When Slack rate limits that, it uses the coordinator's working memory instead.
3. `run`: runs `@phaseo/agent-sdk` through the gateway (the `PHASEO_API` service binding) with the installation's managed key and model. Every request carries:
   - `user: slack:<team>:<user>`;
   - `x-phaseo-metadata` labels `app=slack-agent`, `slack_team` and `slack_channel`;
   - `x-title: Phaseo Slack agent`;
   - `provider.data_collection: "deny"`;
   - the gateway's web search and fetch tools.

   It stops after 12 steps or $0.50 of model spend. The answer streams into Slack with `chat.startStream` and `chat.appendStream`, batched about every 400 ms. After every agent step the answer so far and what it cost are staged in the coordinator, and the cancel flag is checked.
4. `reply`: finishes the Slack message with a footer (model and cost). It stops the stream, or, when the live stream failed or the run was retried, writes the staged answer with `chat.update` (or `chat.postMessage` if the stream never started).
5. `finish`: counts the answer in the meter, if the person could see it, and tells the coordinator.

Step outputs hold ids and statuses only. A retried step never posts twice: the
reply's `ts` is stored as soon as Slack returns it, and a retry updates that
message.

A failed Slack write never runs the model again. The live stream stops, the
model finishes, and the `reply` step (retried up to 3 times on its own) delivers
the staged answer. The `run` step is retried once for other failures; the retry
counts what earlier attempts spent against the $0.50 limit, and the footer shows
the total.

The usage tools are `get_spend`, `get_credit_balance`, `get_key_usage` and
`find_models`. They are offered only when the installation's `usage_data_mode`
allows them in the conversation and the person is linked to a member of the
workspace. They sum in the database (`get_workspace_spend_buckets`,
`get_workspace_key_spend`).

## Secrets

Set with `wrangler secret put <NAME> [--env production]`.

| Secret | Required | What it is |
|---|---|---|
| `SLACK_SIGNING_SECRET` | yes | The hosted Phaseo Slack app's signing secret. |
| `SLACK_SECRETS_ENCRYPTION_KEY` | yes | Decrypts installation and company app secrets. The same value as web-api. |
| `SLACK_STATE_SECRET` | yes | Signs account link tokens. The same value as web-api, which confirms them. |
| `SUPABASE_URL` | yes | The Supabase project URL. |
| The Supabase service key (named in `src/env.ts`) | yes | The Slack tables deny every other role. |
| `SLACK_APP_ID` | no | The hosted app's id. When set, `/events` refuses events for any other app. |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | no | The hosted app's client credentials. They are only needed when token rotation is on, to refresh bot tokens. |
| `SLACK_SECRETS_ENCRYPTION_KEY_VERSION` | no | Defaults to `v1`. It must match web-api. |

Vars:
- `ENV`.
- `PHASEO_WEB_ORIGIN`: where `/slack/link` lives (default `https://phaseo.app`).
- `PHASEO_API_BASE_URL`: the gateway (default `https://api.phaseo.app/v1`).

The production env also binds `PHASEO_API` to the `phaseo-gateway` Worker,
which agent turns use instead of the public URL.

## Local development

```sh
cp apps/slack/.dev.vars.example apps/slack/.dev.vars   # then fill in test values
pnpm --filter @phaseo/slack-agent dev                   # wrangler dev on :8789
pnpm --filter @phaseo/slack-agent test
pnpm --filter @phaseo/slack-agent typecheck
```

Expose the dev server with a tunnel, then point a Slack sandbox app's event and
interactivity URLs at it.

`src/lib/slack-secrets.ts` and `src/lib/slackAgentPricing.ts` are generated from
`packages/shared`. Edit the shared modules, then run:

- `node scripts/sync-slack-secrets.mjs`
- `node scripts/sync-slack-agent-pricing.mjs`
