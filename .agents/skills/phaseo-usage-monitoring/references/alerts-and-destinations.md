# Alerts, notification routes and observability destinations

## Contents

- [Balance alerts and auto top-up](#balance-alerts-and-auto-top-up)
- [Notification destinations and routes](#notification-destinations-and-routes)
- [Observability destinations](#observability-destinations)
- [I/O logging policy](#io-logging-policy)
- [Tracing from your own code](#tracing-from-your-own-code)

Read current settings before changing anything, and confirm with the user before enabling a destination that sends request data outside Phaseo.

## Balance alerts and auto top-up

`GET /v1/notifications/settings` and `PATCH /v1/notifications/settings` (owner or admin, with the matching settings scope) hold:

- `low_balance_email`: `enabled`, `threshold_usd`
- `auto_top_up`: `enabled`, `balance_threshold_nanos`, `amount_nanos`, `payment_method_id`
- `email_preferences`

For an in-app check, compare `available_nanos` from `GET /v1/credits` with your own threshold. Phaseo's documented spend controls are key limits and workspace budgets, which reject requests with `429 key_limit_exceeded` once reached; set them up with `phaseo-guardrails`.

## Notification destinations and routes

Destinations are shared by the workspace: email addresses or lists, Discord (bot token or webhook), Slack incoming webhooks, Microsoft Teams workflow URLs and custom HTTPS webhooks. Add them in **Gateway → Settings → Notifications**, or with `/v1/notifications/destinations`. Send a test (`POST /v1/notifications/destinations/test` or `POST /v1/notifications/destinations/{id}/test`) before relying on one. Targets are encrypted and never returned.

`GET /v1/notifications/routes` lists, and `PUT /v1/notifications/routes/{eventKind}` replaces (`destination_ids`, up to 50), the destinations for each event kind:

| Event kind | When |
| --- | --- |
| `low_balance` | Balance falls below the configured threshold |
| `auto_top_up_failed` | An automatic top-up failed |
| `payment_method_expiring` | The saved payment method is about to expire |
| `model_deprecation` | A model the workspace uses is scheduled for retirement |
| `model_substitution` | Retired-model routing answered with a replacement model |

Custom webhooks must use HTTPS; validate each delivery before processing it and return quickly. Creating one returns a `signing_secret` (`whsec_…`) once. Deliveries carry `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<raw body>`, the same scheme as video and batch webhooks. `has_signing_secret: false` means an older destination that is still sent unsigned; `POST /v1/notifications/destinations/{id}/rotate-secret` generates or replaces the secret.

## Observability destinations

Send request telemetry to your own collector. Requires a management API key with `settings:read` (list, get) or `settings:write` (create, update, delete).

- `GET` / `POST /v1/observability/destinations`; `GET` / `PATCH` / `DELETE /v1/observability/destinations/{id}`
- `type`: `webhook` or `otel_collector`; `name`; `config` is a write-only string map, encrypted at rest and never returned (`configured` shows whether it exists). Endpoints must be public HTTPS addresses.
- Policy fields: `enabled`, `privacy_mode` (excludes prompts and outputs), `sampling_rate` (0.0001–1), `include_generation_metadata`, `include_cost_metadata`, `include_identity_metadata`, `include_request_context`, `key_filters` (`key_id` with `include` or `exclude`), `rule_groups` with `group_join` (`and` or `or`)
- On `PATCH`, omit `config` to keep the stored configuration.

Start with `privacy_mode: true`, `include_cost_metadata: true` and a key filter for one service, then widen.

## I/O logging policy

`GET` / `PATCH /v1/observability/logging-policy` (`settings:read` / `settings:write`) controls whether Phaseo stores request input and output: `enabled`, `retention_days` (90–365) and `include_provider_payloads`. Billing fields are read-only. This stores prompt and response content, so change it only on an explicit user request. Cost and usage monitoring does not need it.

## Tracing from your own code

Existing tracers (Langfuse, LangSmith, OpenTelemetry) work unchanged when the wrapped OpenAI-compatible client points at `https://api.phaseo.app/v1`. Add the model ID, endpoint, the `x-request-id` value and the provider as span attributes. Never add API keys as attributes.
