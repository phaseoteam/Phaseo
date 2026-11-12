---
name: realtime-maintenance
description: Run a Phaseo realtime voice maintenance window end to end. Use it to plan the window and draft its status.phaseo.app posts, stop new realtime sessions, wait for live calls to end, deploy the phaseo-realtime relay Worker, check it, and reopen. Use it whenever the relay must be deployed (realtime relay code changed, or a fix must reach live calls) and for the one-time first deploy of phaseo-realtime. Not for gateway deploys, which happen on merge and don't end calls.
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
The status page (status.phaseo.app, incident.io org `ai-stats-team`) is
updated by the user in the incident.io dashboard. incident.io's API keys need a
paid plan Phaseo doesn't have, and its MCP server and `inc` CLI can't publish
status-page maintenance. So this skill drafts each status-page post, asks the
user to publish it, and waits for confirmation before moving on. API callers
are told directly either way: during the window, session creation returns
`503 realtime_maintenance` with the expected end time and `Retry-After`.

## Step 1: plan and announce (at least 24 hours ahead)

1. Agree the start time with the user. The window lasts until the last call
   ends; announce at least 2 hours 30 minutes (120-minute calls plus deploy and
   checks).
2. Draft the announcement for the user to schedule in the incident.io
   dashboard (status page → maintenance). Give them every field ready to paste:
   - Name: `Realtime voice maintenance`
   - Affected component: the realtime voice component. If the page has none,
     suggest adding one (for example "Realtime voice API") rather than putting
     the whole API under maintenance.
   - Start: `<start>` UTC. End: `<start + 2h30>` UTC.
   - Message: "New realtime voice sessions will be paused from `<start>` UTC
     while we upgrade. Calls already in progress are not interrupted. New
     sessions resume as soon as the upgrade is done."
   - Notify subscribers: yes. Don't let incident.io end the window
     automatically at the end time: it ends when the work ends.
3. Ask the user to confirm it's published (use the question tool), and don't
   start Step 2 until they do. If they choose not to announce, go on: the 503
   still tells API callers.

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

2. Ask the user to mark the window "in progress" in the incident.io
   dashboard, with the component set to under maintenance and this update:
   "New realtime voice sessions are paused. Calls in progress continue until
   they end." Don't wait on it to continue: the switch is what matters.

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

5. Ask the user to complete the window in the incident.io dashboard with:
   "Maintenance is complete and new realtime voice sessions are available
   again." The component goes back to operational.

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
- Print or commit any Worker secret.
