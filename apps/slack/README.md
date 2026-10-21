# Phaseo Slack agent Worker

The Cloudflare Worker behind the Phaseo Slack agent (`slack.phaseo.app`). It
receives Slack events and button clicks, decides who may get an answer, and runs
one turn at a time per Slack thread. Installing, settings and the month-end
charge live in `apps/web-api`; this Worker reads the same tables.

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

## Durable Objects

- `ThreadCoordinator` (`THREADS`), one per `installation:channel:thread_ts`.
  - Dedupes event ids.
  - Runs one turn at a time and queues follow-ups.
  - Holds the cancel flag.
  - Keeps working memory: the bot's replies and short tool summaries.
  - Deletes everything 7 days after the last activity.
- `WorkspaceMeter` (`METERS`), one per installation.
  - Admits or refuses each answer: bots, Slack Connect users, guests, status, the plan's people, max people, the monthly spending cap and answers per person per hour.
  - Counts this UTC month's people and answers.
  - Flushes running totals to `record_slack_agent_people` at most about once a minute.
  - Serialises bot token refreshes when Slack rotates tokens.

Both use SQLite storage. Neither keeps Slack text longer than 7 days, and logs
carry ids and statuses only, as Slack's API terms require.

## Secrets

Set with `wrangler secret put <NAME> [--env production]`.

| Secret | Required | What it is |
|---|---|---|
| `SLACK_SIGNING_SECRET` | yes | The hosted Phaseo Slack app's signing secret. |
| `SLACK_SECRETS_ENCRYPTION_KEY` | yes | Decrypts installation and company app secrets. The same value as web-api. |
| `SLACK_STATE_SECRET` | yes | Signs account link tokens. The same value as web-api, which confirms them. |
| `SUPABASE_URL` | yes | The Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The service role key. The Slack tables deny every other role. |
| `SLACK_APP_ID` | no | The hosted app's id. When set, `/events` refuses events for any other app. |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | no | The hosted app's client credentials. They are only needed when token rotation is on, to refresh bot tokens. |
| `SLACK_SECRETS_ENCRYPTION_KEY_VERSION` | no | Defaults to `v1`. It must match web-api. |

Vars: `ENV` and `PHASEO_WEB_ORIGIN` (where `/slack/link` lives, default
`https://phaseo.app`). The production env also binds `PHASEO_API` to the
`phaseo-gateway` Worker for agent turns.

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
