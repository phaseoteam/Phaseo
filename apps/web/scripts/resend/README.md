# Resend Onboarding Automations

Provision 7-day onboarding and checkout-recovery automations:

```bash
pnpm --filter @ai-stats/web resend:provision:onboarding
```

## Required

- `RESEND_API_KEY`

## Optional

- `RESEND_FROM_EMAIL` (default: `AI Stats <noreply@phaseo.app>`)
- `RESEND_ONBOARDING_REPLY_TO_EMAIL` (default: `support@aistats.com`)
- `RESEND_ONBOARDING_DASHBOARD_URL` (default: `NEXT_PUBLIC_WEBSITE_URL` then `https://www.aistats.com`)
- `RESEND_ONBOARDING_PURCHASE_WINDOW` (default: `7 days`)
- `RESEND_CHECKOUT_ABANDONED_TIMEOUT` (default: `24 hours`)
- `RESEND_ONBOARDING_AUTOMATION_STATUS` (`enabled` or `disabled`, default: `enabled`)
- `RESEND_CUSTOMERS_SEGMENT_ID` (optional; if set, purchased users are added to this segment)

## Runtime Flag

To send lifecycle events from the app at runtime, set:

- `RESEND_ONBOARDING_AUTOMATIONS_ENABLED=true`

When this flag is on, signup flow emits `user.created` and falls back to direct welcome email only if event delivery fails.
