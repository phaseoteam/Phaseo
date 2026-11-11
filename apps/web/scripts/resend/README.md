# Resend Automations

Provision onboarding, checkout recovery, and low-balance alert automations:

```bash
pnpm --filter @phaseo/web resend:provision:onboarding
```

## Required

- `RESEND_API_KEY`

## Optional

- `RESEND_FROM_EMAIL` (default: `Phaseo <noreply@phaseo.app>`)
- `RESEND_ONBOARDING_REPLY_TO_EMAIL` (default: `daniel@phaseo.app`)
- `RESEND_ONBOARDING_DASHBOARD_URL` (default: `PUBLIC_WEBSITE_URL` then `https://phaseo.app`)
- `RESEND_ONBOARDING_PURCHASE_WINDOW` (default: `3 days`)
- `RESEND_CHECKOUT_ABANDONED_TIMEOUT` (default: `24 hours`)
- `RESEND_ONBOARDING_AUTOMATION_STATUS` (`enabled` or `disabled`, default: `enabled`)
- `RESEND_CUSTOMERS_SEGMENT_ID` (optional; if set, purchased users are added to this segment)

## Runtime Flag

To send lifecycle events from the app and gateway runtime, set:

- `RESEND_ONBOARDING_AUTOMATIONS_ENABLED=true`

Delivery hygiene also requires `RESEND_WEBHOOK_SECRET` in the web runtime. Configure the
Resend webhook endpoint as `https://phaseo.app/api/webhooks/resend` for delivered, bounced,
complained, failed, and suppressed events. Verified events are deduplicated by their Svix ID;
bounced, complained, and suppressed recipients are hashed and excluded from future retries.
Prior sign-in addresses are retained in a service-role-only identity table so account deletion
can remove every corresponding Resend contact after an email change.

When this flag is on:
- signup emits `user.created`
- checkout start emits `checkout.started`
- successful purchase emits `credits.purchased`
- low-balance threshold checks emit `workspace.low_balance` from the gateway API

If this flag is disabled, low-balance notifications fall back to the legacy `email_outbox` path.

Provisioning does not import contacts or replay historical users. Automations only run for
events emitted after they are enabled. Signup welcome email is automation-only; there is no
direct-send or database-outbox fallback.
