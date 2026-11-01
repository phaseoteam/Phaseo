# Phaseo Connect relay

Phaseo Connect lets the phone app reach the desktop app from anywhere. It costs $1 a month from credits, charged for the UTC days it was on. The relay is its own Worker, `phaseo-connect` (`apps/api/wrangler.connect.toml`), with one `ConnectRoom` Durable Object per desktop. It is not deployed with `phaseo-gateway`. Deploying it ends every open relay socket; the desktop and phone reconnect by themselves, and held envelopes are kept.

## First deploy

1. Apply the `connect_subscriptions` migration through the normal migration deploy. The relay reads `get_connect_entitlement`, and web-api calls `get_connect_state`, `set_connect_enabled`, `list_connect_due_charges` and `charge_connect_month`.
2. Set the relay's secrets. They have the same values as `phaseo-gateway`'s:

   ```sh
   cd apps/api
   pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.connect.toml
   pnpm exec wrangler secret put KEY_PEPPER_ACTIVE --config wrangler.connect.toml
   # Only while a pepper rotation is in progress:
   pnpm exec wrangler secret put KEY_PEPPER_PREVIOUS --config wrangler.connect.toml
   ```

3. Run `pnpm --filter @phaseo/gateway-api build:connect` (a dry run), then deploy with `pnpm exec wrangler deploy --config wrangler.connect.toml`. The `connect.phaseo.app` custom domain in the config creates its DNS record and certificate on the first deploy.
4. Check the deploy: `curl -i https://connect.phaseo.app/v1/desktop/x` returns 404, and the same request with a 16-character ID and no `Upgrade: websocket` header returns 426.
5. Deploy web-api as usual. Its hourly cron, at minute 23, charges each finished month.

## Later deploys

Deploy only when the relay code changes. Pick a quiet hour, because every phone session drops and reconnects. When a pepper rotates, rotate the relay's `KEY_PEPPER_*` secrets with `phaseo-gateway`'s, or desktop keys stop working on the relay. `src/connect-worker-config.test.ts` keeps the relay's `[vars]` equal to the gateway's.

## What the relay keeps

The relay keeps the workspace ID that first connected each room and a hash of its key ID. It keeps SHA-256 hashes of each phone's relay token. It holds up to 500 envelopes or 5 MB per phone for 24 hours. Envelopes are end-to-end encrypted and are never logged.
