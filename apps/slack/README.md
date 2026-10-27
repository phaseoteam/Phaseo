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
| `POST /interactions`, `POST /interactions/:appId` | Interactivity request URL (Cancel, Connect account, feedback, question buttons and the Other form). |
| `GET /health` | Liveness. |

A cron trigger (every minute, production only) starts the recurring tasks that
are due; see [Recurring tasks](#recurring-tasks).

Every Slack request is checked against its v0 signature over the raw body, with
a five-minute window, and acknowledged at once. The work runs after the response,
because Slack wants an answer within three seconds. Retries are acknowledged and
deduped by event id.

**Removed in Slack.** When an admin removes the app inside Slack (`app_uninstalled`),
or its bot token is revoked (`tokens_revoked` listing the bot user), the Worker
calls `uninstall_slack_agent_from_slack`. In one transaction it deletes the
installation's gateway key, marks the installation uninstalled (which deletes
its notes and skills), removes its guardrail and records
`slack_agent.uninstalled_in_slack` in the audit log, in
the same order as Uninstall in Phaseo settings. The Worker handles this event
before answering Slack, so a database failure returns 500 and Slack retries it.
Repeats are safe, and an event older than the current install is ignored. The
app's manifest must subscribe to both events.

Refusals are recorded in the workspace audit log (`slack_agent.answer_refused`).
The ones only an owner or admin can fix (plan full, the people limit or spending
cap reached, a charge unpaid) are also emailed to them, at most once a month per
reason. An email can be suppressed or fail, so replies never say an admin has
been told.

## Slack app manifest

`manifest.json` is the hosted app's manifest. The Slack agent guide
(`apps/docs/v1/guides/slack-agent.mdx`, and each translation) prints the same
manifest for companies that use their own Slack app, with `YOUR_APP_ID` in both
request URLs. `test/manifest.test.ts` keeps them in step with the code: the bot
scopes must equal web-api's `SLACK_AGENT_BOT_SCOPES`, the bot events must be
exactly the ones `src/events.ts` handles, and the URLs must point at this
Worker's production host and routes.

- `features.agent_view` is Slack's agent messaging experience (new apps can't use
  `assistant_view`). It gives the app its Messages tab and agent sessions.
- `app_uninstalled` and `tokens_revoked` need no scope, but Slack only sends them
  to apps that subscribe.
- `features.app_home.home_tab_enabled` and the `app_home_opened` event give the
  app its Home tab. Until a Slack app's manifest has both, Slack sends no
  `app_home_opened` and the tab doesn't appear; nothing else depends on them.
- Token rotation is off. Slack can't turn it off again, and the hosted app's
  client credentials are optional secrets here.
- Editing the manifest file doesn't change the live Slack app: paste the new
  manifest on the app's App Manifest page in Slack too.

## Durable Objects

- `ThreadCoordinator` (`THREADS`), one per `installation:channel:thread_ts`.
  - Dedupes event ids.
  - Runs one turn at a time and queues follow-ups.
  - Holds the cancel flag.
  - Keeps working memory: the bot's replies and short tool summaries.
  - Keeps the timestamps (no text) of the thread's newest known messages, where the next read starts.
  - Remembers who was sent the Connect button in the thread.
  - Holds the running turn's questions: the paused run, the question and its answer. The first answer from the person asked wins and wakes the turn's Workflow; so does stopping the thread while it waits.
  - Deletes everything 7 days after the last activity.
- `WorkspaceMeter` (`METERS`), one per installation.
  - Admits or refuses each answer: bots, Slack Connect users, guests, status, the plan's people, max people, the monthly spending cap and answers per person per hour.
  - Counts this UTC month's people and answers. An answer counts in the month it was admitted in, even when it finishes after midnight.
  - Flushes running totals to `record_slack_agent_people` at most about once a minute.
  - Serialises bot token refreshes when Slack rotates tokens.
  - Keeps Slack's `Retry-After` when a thread read gets 429, so no thread of the installation reads until it has passed.
  - Keeps an answer that waits for a reply to its question pending for the wait (`keepPending`), so it stays one answer.

Both use SQLite storage. Neither keeps Slack text longer than 7 days, and logs
carry ids and statuses only, as Slack's API terms require.

## Agent turns

Each answer is an `AgentTurnWorkflow` instance (`AGENT_TURNS`, Cloudflare
Workflows), one per Slack event, kept for 1 day. It has five steps, and four
more for each question the agent asks (see below):

1. `load`: re-checks the installation and access. It sets the Slack session to `processing` (`agents.sessions.setStatus`).
2. `context`: one `conversations.replies` read of up to 15 messages, ending at the message answered (`src/history.ts`). Slack allows apps outside the Marketplace about one read a minute per workspace, 15 messages each, and returns a range's earliest messages first, so the read starts at the oldest of the 8 newest messages the coordinator knows (in a channel, never more than 30 minutes back; the first read in a thread goes 30 minutes back). Slack sends the thread's first message with every read. When the stretch held more, the prompt says messages are missing. Only the installation's bot user (or its app) is the agent in the prompt; other bots and apps are labelled `Another app (name)`. When Slack rate limits the read, the coordinator's working memory is used alone, and the meter keeps Slack's `Retry-After`: until it passes, every thread of the installation skips its read and uses working memory too. Reads aren't spaced otherwise, for the hosted app or a company's own app: Slack tolerates small bursts, and a refused read only costs that turn its read.
3. `run`: runs `@phaseo/agent-sdk` through the gateway's public URL (`PHASEO_API_BASE_URL`) with the installation's managed key and model (or the model chosen for the message, below). Every request carries:
   - `user: slack:<team>:<user>`;
   - `session_id: slack-<Slack event id>`, the same for every request of one answer, so Logs can show them together (and the gateway keeps them on one provider);
   - `x-phaseo-metadata` labels `app=slack-agent`, `slack_team` and `slack_channel`;
   - `x-title: Phaseo Slack agent`;
   - the gateway's web search and fetch tools.

   Which providers may serve it is decided by the installation's **Slack agent** guardrail (no training or prompt publishing; providers that keep logs without training may answer), which the gateway applies from its provider data-policy metadata. The request doesn't send `provider.data_collection`: the gateway rejects `"deny"` with a 400.

   It stops after 12 steps or $0.50 of model spend (other models it asks count too, below). The answer streams into Slack with `chat.startStream` and `chat.appendStream`, batched about every 400 ms. After every agent step the answer so far and what it cost are staged in the coordinator, and the cancel flag is checked. A Compare (below) asks its models instead of running the agent.
4. `reply`: finishes the Slack message with a footer: the model's catalogue name (with Auto, also the model it picked, after an arrow; other models the answer asked or compared, after a `+`) and the cost. A catalogue model's name links to its page (`PHASEO_WEB_ORIGIN/models/<model_slug>`; Auto has none), and the cost links to Logs filtered to the answer's session (`/settings/usage/logs/requests?session=…`, from the day before to the day after). The footer is a context block (`<url|text>` links) under a stopped stream, or italic markdown (`[text](url)`) when the answer is written with `chat.update` or `chat.postMessage`. It stops the stream, or, when the live stream failed or the run was retried, writes the staged answer with `chat.update` (or `chat.postMessage` if the stream never started).
5. `finish`: counts the answer in the meter, if the person could see it, and tells the coordinator.

Step outputs hold ids and statuses only. A retried step never posts twice: the
reply's `ts` is stored as soon as Slack returns it, and a retry updates that
message.

A failed Slack write never runs the model again. The live stream stops, the
model finishes, and the `reply` step (retried up to 3 times on its own) delivers
the staged answer. The `run` step is retried once for other failures; the retry
counts what earlier attempts spent against the $0.50 limit, and the footer shows
the total.

### Choosing a model per message

When an admin turns on `model_choice_enabled`, a message that starts with
`with <model>:` is answered by that model (`src/model-choice.ts`). `<model>` is
one of the installation's `allowed_models` (up to 10, which web-api checks
against the catalogue): its id or catalogue name, or the start of either when
only one allowed model has it, ignoring case. Nothing outside the allowlist is
matched, and the longest reading is tried first, since catalogue names can hold
a colon. `src/events.ts` decides it before the meter admits the person: a name
that isn't allowed, or fits more than one model, gets a private reply listing
the models, and no turn, person or answer is counted. A chosen model travels
with the turn (the coordinator's `turns.model`), and the prompt is the message
without the prefix. The run re-checks the live installation and falls back to
its model if an admin removed the choice meanwhile. The turn's $0.50 and 12-step
limits don't change.

### Asking another model

While model choice is on and at least one allowed model isn't the one answering,
the agent gets `ask_model` (`src/ask-model.ts`): it sends another allowed model a
self-contained prompt and gets its text back. The other model sees nothing of
the thread beyond that prompt. It is one non-streaming `/responses` request
(`AgentRunner.ask`) with the answer's key, `user`, `session_id`, labels and
`x-title`, no tools and at most 4,000 output tokens. An answer may ask 3 times
(failures count, and so do consults before a question: the run after it takes
over `consultCount`), one consult at a time. Each consult's cost counts against the
same $0.50: the run's stop condition adds it to the agent's own spend
(`otherCostUsd`), and a consult is refused while less than $0.10 of the limit is
left, so the agent can still finish. Gateway refusals become tool errors the
agent can explain (`consultErrorText`). The models that answered travel in the
run step's output (`consulted`, ids only) to the footer; the working memory
notes `ask_model <model id>`, never the prompt or the answer.

### Comparing models

A message that starts with `compare <model>, <model>[, <model>]: <question>`
names 2 or 3 allowed models, each matched like `with <model>:`
(`chooseComparison` and `decideComparison` in `src/model-choice.ts`), with the
same private refusals before the meter: a model that isn't allowed, an
ambiguous name, a longer reading of the last name that is another catalogue
model, fewer than 2 or more than 3 different models, or no question. A list
that names no allowed model is an ordinary message unless one of its names is a
catalogue model. The models travel with the turn (the coordinator's
`turns.compare`, JSON) and the run re-checks them against the live allowlist,
answering as usual when fewer than 2 are still allowed.

The run step (`src/compare.ts`) sends the question alone to every model at
once, each a non-streaming request with the gateway's web search and fetch
tools and at most 4,000 output tokens, and splits what is left of the $0.50
evenly between them. The gateway can't stop one request at a dollar amount, so
the share is held at request boundaries like the agent's own limit: a model
whose share is under $0.02 (a retry after earlier attempts spent most of it)
isn't asked. The reply, written through the same stream and footer as any
answer, has a section per model: its name linked to its page, its cost and its
answer (cut so all of them fit one Slack message), or why it failed. It counts
as one answer when at least one model answered; the cancel flag is checked
every 2 seconds while the models answer.

### Questions with buttons

The agent always has `ask_question` (`src/questions.ts`): a short question and 2
to 5 short options, optionally with **Other…** for an answer in the person's own
words. The tool pauses the agent SDK run (it returns null from `onToolCalled`,
so the run waits for that call's output) and the run step ends `waiting`, with
the paused run (its messages and step count, not its costs or items) kept in the
coordinator. Then, for question `n` (at most 3 per answer):

1. `ask-n`: finishes the reply so far without a footer, posts the question with a button per option (`chat.postMessage`), stores its `ts` at once, keeps the meter's pending answer for the wait, and leaves the session `processing` so Slack's stop button stays.
2. `answer-n`: `step.waitForEvent` (type `answer-n`, timeout 1 hour), between steps. The coordinator sends the event (`instance.sendEvent`, with the question number only) when the person answers or the thread is stopped.
3. `close-n`: closes the question in the coordinator (answered, expired, or stopped: cancelled, paused or uninstalled) and shows that on its message.
4. `resume-n`: continues the paused run with the answer as the call's output (`continueStream`), like the run step: one retry, every earlier attempt's cost counted against the $0.50 limit, and the 12 steps spanning the whole answer.

Only the person the turn answers can answer; anyone else who clicks gets a
private note, and the first answer wins (a double click changes nothing). They
answer with a button, the Other form (`views.open`, then `view_submission`), or
a message in the thread, which is taken as the answer and isn't metered as a new
one. Anyone else who writes meanwhile is queued and told privately whose answer
it waits for. Unanswered, the question says it expired after an hour, and the
answer ends there and is counted (the person saw it). Stopping the thread while
it waits ends it uncounted. The coordinator times a waiting turn out 20 minutes
after its question closes, not after the turn started. Step outputs and the
Workflow event hold ids and statuses only; the question, options and answer live
in the coordinator.

### Home tab

`app_home_opened` for the `home` tab publishes the person's Home tab
(`views.publish`, `src/home.ts`): how to use the agent, its model, whether their
Phaseo account is connected (with the Connect button when connecting would let
them use the agent or ask about usage), and this month's answers in the Slack
workspace for someone linked to a member of the workspace. It holds settings and
counts, never message text.

### Usage tools

The usage tools are `get_spend`, `get_credit_balance`, `get_key_usage` and
`find_models`. They are offered only when the installation's `usage_data_mode`
allows them in the conversation and the person is linked to a member of the
workspace. They sum in the database (`get_workspace_spend_buckets`,
`get_workspace_key_spend`). Where they would be offered but the person hasn't
linked an account (an installation open to everyone), the agent gets
`connect_phaseo_account` instead: it sends the Connect button privately when
they ask about usage, at most once per person in a thread.

### Memory and skills

Turns get the memory tools (`src/memory.ts`): `remember`, `recall`,
`update_todo` and `forget` for notes, pins and to-dos, and `save_skill`,
`list_skills` and `use_skill` for skills (named instructions for a repeated
task). Slack's API terms forbid archiving Slack messages, so the instructions
tell the model to save a short note in its own words only when someone asks it
to remember something (or for a lasting fact), never a copied message, and to
save a skill only when someone explicitly asks.

- A note is for one conversation (`channel_id`) or the whole Slack workspace
  (null). A turn only ever reads or changes its own conversation's notes and the
  workspace's. Notes can expire; expired ones are hidden at once and deleted on
  the next turn or save.
- Someone from another organisation (Slack Connect; the `isExternal` fact the
  meter checks) gets only their conversation's notes: the Worker marks their
  turn `external` in the coordinator, the turn passes `p_workspace_notes: false`
  to every note function, and `remember` has no workspace scope. Skills are the
  same for everyone.
- `slack_installations.memory_enabled` (on by default) is the admins' switch.
  Off, turns get only the skill tools and no pins, and the note functions read,
  save, change and forget nothing (`save_slack_agent_note` returns
  `memory_off`). Saved notes are kept; admins can still list and delete them.
- Before the conversation, the prompt lists up to 10 of the conversation's pins
  and 10 workspace pins (as above, when the turn may see them), and the names
  and descriptions of the 20 most recently changed skills
  (`load_slack_agent_turn_memory`, one call). A failed read leaves them out; the
  turn goes on.
- Writes go through database functions with the service role
  (`save_slack_agent_note`, `save_slack_agent_skill`), which cap an installation
  at 500 notes and 100 skills and lock the installation row while they write.
  The service role can't insert into `slack_agent_notes` or `slack_agent_skills`
  directly.
- Owners and admins list, delete and edit them in Settings → Slack (web-api
  `/api/account/settings/slack/memory`).
- Marking an installation uninstalled, from Phaseo settings or in Slack, deletes
  its notes and skills in the same transaction (the `delete_slack_agent_memory`
  trigger).

### Recurring tasks

Turns that aren't scheduled runs get `schedule_task`, `list_schedules` and
`cancel_schedule` (`src/schedules.ts`). A schedule is a self-contained prompt
for one conversation, run hourly (at a minute), daily, on weekdays, weekly or
monthly at a local time in the creator's Slack time zone (`users.info` `tz`).
The tool returns the next run, which the agent confirms. Someone from another
organisation can list and cancel but not set one up.

- `slack_agent_schedules` holds them. Inserts only go through
  `save_slack_agent_schedule`. It holds the installation's
  `schedules_enabled` switch, `schedule_creators` (`linked` needs a linked
  account) and `schedules_max` (20 by default, at most 100), under a lock on
  the installation row. Each `schedule_task` call passes a `creation_key` (the
  turn's event id, the run after question n, and the call's number in that run),
  so a retried run step gets the schedule it saved instead of a second one.
- `cancel_slack_agent_schedule` lets the creator cancel, or a Slack person
  linked to an owner or admin of the workspace.
- `slack_agent_schedule_next_run` computes every next run in the database.
  Hourly is the finest frequency, and a run's next one is at least 59 minutes
  after it was claimed (`last_claimed_at`), even when it was claimed late, and
  after a resume, so nothing runs more than once an hour.

The cron trigger (`* * * * *`, `env.production` only; the preview Worker has
none) calls `claim_slack_agent_schedules` once a tick (`src/scheduled-runs.ts`).
In one statement that call:

- takes up to 50 due rows through the partial index on `next_run_at`,
  `FOR UPDATE SKIP LOCKED`;
- sets `last_run_at` to the time each was due (which keys the run),
  `last_claimed_at` to now, and moves `next_run_at` on;
- pauses the rows of installations that aren't active, and skips them while
  recurring tasks are off.

A run is claimed once, so overlapping ticks never start it twice. For each run:

1. The installation is active, and the creator may still use the agent: linked
   where required; not a bot, deactivated, or a guest or someone from another
   organisation the installation refuses.
2. The meter admits it like a message, for the creator. The run's event id
   (`Sched<schedule id><due epoch>`) makes a repeat a no-op.
3. A short `Scheduled: <title>` message goes to the conversation. The title is
   escaped, verbatim and posted with `parse: none`, so `@here` and the like in it
   never become mentions (the same for the Home tab and the creator's DM).
4. The turn is queued in that message's thread coordinator (`turns.schedule_id`,
   `turns.schedule_run_at`) and runs as an `AgentTurnWorkflow`: the same checks,
   the $0.50 and 12-step limits, the usual footer, one answer. Scheduled runs get
   no `ask_question` and no schedule tools.

`record_slack_agent_schedule_run` records the outcome once per run, keyed by
`last_run_at`, so a retried Workflow step never counts twice. It is called:

- when the run can't start (tried 3 times, then given up);
- by the thread coordinator when it gives up on the turn: its Workflow couldn't
  be created (`start_failed`) or it timed out (`timed_out`), also tried 3 times;
- from the turn's `skip` or `finish` step, which fails when the call doesn't go
  through, so Workflows retries it (up to 3 times).

- Lost access, a paused installation or a conversation the agent can't post in
  (`not_in_channel` and similar) pause the schedule with that reason.
- Anything else, such as the meter refusing over the spending cap, counts as a
  failure. The third in a row pauses it.
- The creator gets a DM (`chat.postMessage` to their user id) when a schedule
  pauses for failures or because the agent can't post in its conversation.

A tick that dies between claiming and queueing loses that one run; the next is
on time. The Home tab lists the viewer's own schedules. Owners and admins list,
pause, resume (`set_slack_agent_schedule_status`) and delete them in
Settings → Slack (web-api `/api/account/settings/slack/schedules`). Uninstalling
deletes them (the `delete_slack_agent_schedules` trigger).

## Secrets

Set production secrets with `wrangler secret put <NAME> --env production`.
Without `--env production` the secret goes to the preview Worker, because
secrets aren't shared between environments. CI deploys the production Worker
on every push to `main`, and the deploy fails while a required secret is
missing.

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
| `DISCORD_SIGNUP_WEBHOOK_URL` | no | Phaseo's internal Discord webhook, the same value as web-api. When set, removing the app inside Slack posts a short alert (workspace, Slack team, hosted or company app). Without it there is no alert. |

Vars:
- `ENV`.
- `PHASEO_WEB_ORIGIN`: where `/slack/link` lives (default `https://phaseo.app`).
- `PHASEO_API_BASE_URL`: the gateway (default `https://api.phaseo.app/v1`).

Agent turns call the gateway's public URL rather than a service binding. A
service binding's request carries no country, and providers that refuse requests
from an unknown country (OpenAI, Anthropic and others) would then never answer.

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
