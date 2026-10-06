# Provider model review

Provider identity is approved once. An approved provider can attach to existing public canonical models and update its offers, capabilities, lifecycle and effective prices automatically. Unknown IDs in its own namespace create proposals; they do not create canonical models or routes until an administrator approves them.

Review proposals at `/settings/internal/provider-review`. Repeated submissions reuse the request. Approval requires the displayed revision to still be current. Removed proposals are withdrawn. Corrected rejected proposals can return to review. Approval creates the hidden canonical identity and requests a fresh full-catalog sync; routing still requires the existing endpoint, adapter, credentials and pricing guards.

## Slack

Use the private Phaseo `provider-model-review` channel. Configure an incoming webhook for that channel and store it as the Cloudflare Worker secret `PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK` on `phaseo-web-api`. Never put the URL in Git, public environment variables, a catalog, a client response, or logs. Provision it through the authenticated secret manager or Wrangler's interactive secret input; do not pass the value as a command argument.

The notifier accepts only HTTPS `hooks.slack.com/services/` destinations and rejects redirects. Messages contain only a pending count and an authenticated review-page link, with unfurling disabled. Catalog fields, identities, credentials, raw payloads and webhook URLs are excluded. Pending notifications use database leases and retry after 15 minutes; delivery is at least once, so an acknowledgment failure can repeat a notification. Slack failure never prevents catalog ingestion. Without a configured secret, requests remain available in the admin queue.

## V1 boundary

Pricing feeds provide exact effective prices, including promotional prices, in nanos with explicit units. Conditional prices and automatic percentage-discount calculations are unsupported. Preserve price history rather than replacing old rates. Existing-model attachment does not grant providers control of another publisher's canonical facts.

## Webhook retry recovery

Completed webhook event IDs remain deduplicated. Failed or interrupted deliveries can retry with the same signed event ID after Phaseo obtains the provider sync lease, unless a newer catalog has already been applied. A replay never interrupts an active sync. Rejected catalogs require a new event ID after correcting the feed. Price fingerprints prevent a recovered delivery from creating duplicate price versions.
