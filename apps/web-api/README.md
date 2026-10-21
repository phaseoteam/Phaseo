# Web API Worker

This Worker owns the server-side API used by the Phaseo web application. It is separate from the public Gateway API and keeps authenticated application data out of browser-only code.

## Responsibilities

- serve cacheable public catalogue and reference data;
- authorize workspace and account reads and mutations;
- proxy authenticated playground requests;
- keep user, workspace, billing, and credential data private and uncached;
- apply route-specific validation, authorization, and cache policy.

The route implementation is under `src/routes`. Runtime bindings are declared in `src/env.ts` and `wrangler.toml`.

## Local development

Use non-production values in `apps/web-api/.dev.vars`, then start the Worker:

```bash
pnpm --filter @phaseo/web-api dev
```

Start the web application with its local Web API origin:

```bash
WEB_API_ORIGIN=http://127.0.0.1:8788 pnpm --filter @phaseo/web dev
```

Never use production credentials for local development or commit `.dev.vars`.

## Slack agent secrets

The Slack agent's settings routes (`/api/account/settings/slack*`) return 503 `slack_not_configured` until these are set:

- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`: the hosted Phaseo Slack app's OAuth credentials (a company's own app works without them).
- `SLACK_STATE_SECRET`: signs the OAuth state and account-link tokens. The Slack Worker uses the same value.
- `SLACK_SECRETS_ENCRYPTION_KEY`, optional `SLACK_SECRETS_ENCRYPTION_KEY_VERSION` (default `v1`): encrypt bot tokens, the agent's gateway key and custom app secrets. The Slack Worker uses the same values.
- `KEY_PEPPER_ACTIVE`: already required for gateway keys.
- Optional `PHASEO_WEB_ORIGIN` (default `https://phaseo.app`): the origin of the OAuth redirect and the settings page.

Register `https://phaseo.app/api/account/settings/slack/oauth/callback` as the Slack app's redirect URL. The callback checks the browser's Phaseo session cookie, so it only completes on the origin where people sign in.

## Validation

```bash
pnpm --filter @phaseo/web-api lint
pnpm --filter @phaseo/web-api test
pnpm --filter @phaseo/web-api build
```
