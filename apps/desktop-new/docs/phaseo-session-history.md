# Desktop session history

Claude Code and Codex completed turns sync to Phaseo web **Activity → Sessions → Desktop sessions** while exactly one Phaseo workspace account is connected. Multiple provider bindings for the same account/workspace are supported. Different connected workspaces are ambiguous, so publishing pauses rather than selecting one implicitly.

The first-party `POST /desktop/session-turns` endpoint requires an active Phaseo Desktop OAuth token with gateway access and current workspace membership. Ownership comes from authentication. Only environment/chat/turn IDs, provider/model IDs, terminal status, timestamps and normalized main-agent token usage are accepted. Prompts, answers, reasoning, tool output, project paths and credentials are never uploaded. Native usage is reported metadata; it is never added to gateway request counts, costs or billing.

New completed turns are queued in the desktop SQLite database and delivered every 30 seconds. Failed deliveries remain queued across restarts; reports are idempotent by account, environment and turn ID. A verified identity lookup supports opaque OAuth keys, and local credential/account hashes survive token rotation and prevents one account's queued history being sent through another. Undelivered entries expire after 30 days. Old conversations are not automatically backfilled, and sessions completed while disconnected are not queued.

The web Sessions view refreshes through the existing private query cache every five minutes. It groups the latest 100 completed turns in the selected time period by environment, chat and provider. Duration and token totals cover those returned turns; partial or unavailable usage is labeled explicitly. Chat links use the existing registered production/development desktop schemes and open the correct environment route.

## Rollout

Apply `supabase/migrations/20261006153000_desktop_session_turns.sql`, then release API, web API and web, and load the updated desktop build. The local SQLite migrations run automatically. Verified ownership is cached without storing plaintext credentials, so established accounts continue queuing while offline. The cloud migration and production deployment require approval. Until the endpoint is released, the desktop queue safely retries without blocking chats. The endpoint is private to the desktop OAuth integration and is not a public SDK operation.

## Verification

- `node supabase/tests/desktop-session-turns.test.mjs`: real PostgreSQL-compatible migration, RLS, revoked membership and direct write denial.
- API tests: verified ownership, client/scope/membership checks, bounded bodies, private-field rejection and idempotent writes.
- Desktop tests: usage redaction, account partitioning, retry retention, in-flight update protection and safe chat links on startup and in the running app.
- Web API tests: user/workspace filtering, private cache headers and authentication.
- Web tests: grouping, latest model/status, deduplication and unavailable/partial usage.
