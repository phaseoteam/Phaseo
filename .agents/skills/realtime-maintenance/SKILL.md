---
name: realtime-maintenance
description: Run a Phaseo realtime voice maintenance window end to end. Use it to announce the window on status.phaseo.app, stop new realtime sessions, wait for live calls to end, deploy the phaseo-realtime relay Worker, check it, and reopen. Use it whenever the relay must be deployed (realtime relay code changed, or a fix must reach live calls) and for the one-time first deploy of phaseo-realtime. Not for gateway deploys, which happen on merge and don't end calls.
---

# Realtime maintenance

## Why windows exist

Realtime voice calls are WebSockets held by the `RealtimeRelayDurableObject`
in its own Worker, `phaseo-realtime` (`apps/api/wrangler.realtime.toml`).
Deploying a Worker restarts its Durable Objects and ends their connections a
few minutes later (tested 2026-10-29, close code 1006). Cloudflare has no
shutdown hook and no grace period. `phaseo-gateway` deploys on every merge,
but deploying it doesn't end calls that run in another Worker. So only
`phaseo-realtime` deploys end calls, and they happen only in an announced
window:

1. Announce on the status page ahead of time.
2. Turn the maintenance switch on. New sessions get `503 realtime_maintenance`
   with `Retry-After`; calls already running carry on.
3. Wait until no realtime session is live. **Never end calls to speed this up**
   (product decision, 2026-10-29). The longest call can run 120 minutes (xAI).
4. Deploy the relay with the `realtime-relay-deploy` workflow.
5. Check it, turn the switch off, complete the window.

The deploy script refuses unless the switch is on and no session is live.

## What you need

| Item | Where it comes from |
| --- | --- |
| Cloudflare access for `wrangler` (KV switch, deployments) | `pnpm --filter @phaseo/gateway-api exec wrangler whoami` |
| `gh` signed in with permission to run workflows | `gh auth status` |
| Supabase read access (live session count) | Supabase MCP `execute_sql`, read-only |
| incident.io API key with scope `status_pages.publish_updates` | Infisical prod `/operations/INCIDENT_IO_API_KEY`. If missing, ask the user to create it (incident.io → Settings → API keys) and store it there. Never print it. |

Load the incident.io key into the shell without echoing it:

```bash
export INCIDENT_IO_API_KEY="$(MSYS_NO_PATHCONV=1 infisical secrets get INCIDENT_IO_API_KEY --env=prod --path=/operations --plain --silent)"
```

All incident.io calls go to `https://api.incident.io` with
`Authorization: Bearer $INCIDENT_IO_API_KEY`. The hosted incident.io MCP
server (`https://mcp.incident.io/mcp`) and the `inc` CLI can't publish status
page maintenance, so this skill uses the REST API.

## Step 1: plan and announce (at least 24 hours ahead)

1. Agree the start time with the user. The window lasts until the last call
   ends; announce at least 2 hours 30 minutes (120-minute calls plus deploy and
   checks).
2. Find the status page and the realtime component:

   ```bash
   curl -s https://api.incident.io/v2/status_pages -H "Authorization: Bearer $INCIDENT_IO_API_KEY"
   curl -s https://api.incident.io/v2/status_page_structures/<status_page_id> -H "Authorization: Bearer $INCIDENT_IO_API_KEY"
   ```

   Use the public page for status.phaseo.app (org `ai-stats-team`). If no
   component covers realtime voice, stop and ask the user to add one
   (for example "Realtime voice API"). Don't put the whole API under maintenance.
3. Create the window, with a stable idempotency key so a retry doesn't duplicate it:

   ```bash
   curl -s -X POST https://api.incident.io/v2/status_page_maintenances \
     -H "Authorization: Bearer $INCIDENT_IO_API_KEY" -H "Content-Type: application/json" \
     -d '{"status_page_id":"<id>","name":"Realtime voice maintenance",
          "maintenance_status":"maintenance_scheduled","idempotency_key":"realtime-maint-<YYYY-MM-DD>",
          "affected_component_ids":["<realtime component id>"],
          "start_at":"<start ISO>","end_at":"<start + 2h30 ISO>",
          "message":"New realtime voice sessions will be paused from <start> UTC while we upgrade. Calls already in progress are not interrupted. New sessions resume as soon as the upgrade is done.",
          "notify_subscribers":true,"automate_maintenance_status":false}'
   ```

   Keep `automate_maintenance_status` false: the window ends when the work
   ends, not at `end_at`. Record the maintenance id for the next steps.

## Step 2: start the window

1. Turn the switch on. KV takes up to a minute to reach every location, so a
   location can still start a call just after this. `since` records when the
   switch went on, and the deploy script refuses until it has been on for
   5 minutes, so the final live count includes those late calls.

   ```bash
   cd apps/api
   pnpm exec wrangler kv key put "realtime:maintenance:v1" \
     "{\"enabled\":true,\"since\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"until\":\"<expected end ISO>\",\"message\":\"Realtime voice is in a maintenance window. Calls in progress are not affected; try again after <time> UTC.\"}" \
     --namespace-id f5e23068fcd94125ad9860c817c543d9 --remote
   pnpm exec wrangler kv key get "realtime:maintenance:v1" --namespace-id f5e23068fcd94125ad9860c817c543d9 --remote --text
   # A 404 "Not Found" means the key was never set: the switch is off.
   ```

2. Publish "in progress":

   ```bash
   curl -s -X POST https://api.incident.io/v2/status_page_maintenance_updates \
     -H "Authorization: Bearer $INCIDENT_IO_API_KEY" -H "Content-Type: application/json" \
     -d '{"status_page_maintenance_id":"<id>","maintenance_status":"maintenance_in_progress",
          "message":"New realtime voice sessions are paused. Calls in progress continue until they end.",
          "notify_subscribers":true,
          "component_statuses":[{"component_id":"<realtime component id>","component_status":"under_maintenance"}]}'
   ```

## Step 3: wait for live calls to end

Check with the Supabase MCP (read-only), every few minutes:

```sql
SELECT count(*) AS live, max(expires_at) AS last_possible_end, min(started_at) AS oldest
FROM public.gateway_realtime_sessions
WHERE status IN ('created', 'connecting', 'connected', 'ending');
```

- `last_possible_end` is the provider cap of the longest call; nothing runs past it.
- `created` sessions that never connect settle at $0 after 2 minutes, and the
  reconciliation cron settles dropped calls within about 2 minutes, so `live`
  reaches 0 on its own. Don't end, cancel or update sessions.
- If `live` hasn't moved for a long time past `last_possible_end`, stop and
  ask the user. Don't deploy.

## Step 4: deploy the relay

```bash
gh workflow run realtime-relay-deploy.yml --ref main
gh run list --workflow realtime-relay-deploy.yml --limit 1
gh run watch <run id> --exit-status
```

Right before deploying, the deploy script checks three things itself and
refuses if any fails: the switch is on, it has been on for at least 5 minutes
(`since`), and no session is live. If the deploy fails, leave the switch on, keep the window
open, read the run log, and fix or roll back
(`pnpm exec wrangler rollback --config wrangler.realtime.toml`) before reopening.

## Step 5: check and reopen

1. `pnpm exec wrangler deployments list --config wrangler.realtime.toml`: the
   newest deployment is the workflow's.
2. The relay is reachable through the gateway without starting a provider call
   or spending credit. A well-formed token for a session that doesn't exist
   passes the gateway's checks and is refused by the relay itself:

   ```bash
   curl --http1.1 -s -w "\n%{http_code}\n" -H "Upgrade: websocket" -H "Connection: Upgrade" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Protocol: statsync-realtime, rtsec.rtsec_0000000000000000000000000000000000000000000000000000" \
     https://api.phaseo.app/v1/realtime/sessions/rt_00000000000000000000000000/relay
   ```

   Expect `realtime session not found or token invalid` with 401: that text
   comes from the relay Durable Object. A 5xx or a gateway JSON error means the
   gateway can't reach `phaseo-realtime`. (`--http1.1` matters: over HTTP/2 the
   `Upgrade` header is dropped and the gateway answers `websocket_upgrade_required`.)
3. Paid test calls (a few cents) need the user's budget approval, as for any
   live provider test. Ask before making one.
4. Turn the switch off:

   ```bash
   pnpm exec wrangler kv key put "realtime:maintenance:v1" '{"enabled":false}' \
     --namespace-id f5e23068fcd94125ad9860c817c543d9 --remote
   ```

5. Complete the window (components go back to operational):

   ```bash
   curl -s -X POST https://api.incident.io/v2/status_page_maintenance_updates \
     -H "Authorization: Bearer $INCIDENT_IO_API_KEY" -H "Content-Type: application/json" \
     -d '{"status_page_maintenance_id":"<id>","maintenance_status":"maintenance_complete",
          "message":"Maintenance is complete and new realtime voice sessions are available again.","notify_subscribers":true}'
   ```

6. Report to the user: window times, how long the drain took, the run link,
   the checks, and anything left open.

## First deploy of phaseo-realtime (one time)

`phaseo-gateway` binds the relay with `script_name = "phaseo-realtime"`, so
the Worker must exist before the gateway binds to it:

1. Run the workflow with `initial=true`: `gh workflow run realtime-relay-deploy.yml --ref main -f initial=true`.
   It skips the switch and live-call checks because no call can run on the new
   Worker yet.
2. Merge the PR that points `wrangler.toml` and `wrangler.jobs.toml` at
   `phaseo-realtime`. CI deploys the gateway.
3. Run the Step 5 checks.

Calls running in the gateway's old relay namespace end when that gateway
deploy lands, so do the binding switch inside a window too (Steps 1–3 first)
unless the live count is already 0. `phaseo-gateway` keeps exporting its old,
unused class; deleting it is a destructive migration that needs the user's
explicit approval.

## Never

- End, cancel or edit live sessions to finish a window early.
- Deploy `phaseo-realtime` outside a window (other than the first deploy above).
- Leave the switch on after the window: check it's `{"enabled":false}` before you finish.
- Print or commit the incident.io key or any Worker secret.
