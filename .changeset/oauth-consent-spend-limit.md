---
"@phaseo/gateway-api": minor
"@phaseo/web": minor
---

When you sign in to another app with Phaseo and let it use the Gateway, the consent screen now asks for a monthly spending limit for that app. It starts at $20.00 a month; you can type another amount in US format (20, 20.50 or 1,000.50) or choose No limit. The limit becomes the monthly cost limit of the key the app gets, so the gateway stops the app's requests once it has spent that much from the team's credits in the calendar month. Approving the app again keeps the same key and the month's spending, and applies the limit you just chose. You can change it later under Settings → API Keys. Apps that use Sign in with Phaseo can no longer create anything through the API that could spend outside that limit, whatever permissions they hold: they can only rename or delete API keys, and can't create or rotate keys, change a key's limits, status or expiry, create management keys or trusted workloads, add or invite members, change single sign-on, SCIM or the member directory, or change budgets, guardrails, rate limits or spend rules. Phaseo's own CLI and desktop app, the dashboard and management keys can.
