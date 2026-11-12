---
"@phaseo/gateway-api": minor
---

Push budget alerts to the Phaseo mobile app. When the gateway first rejects a request because a workspace budget or an API key limit is used up, owners and admins (and, for a key limit, the key's creator) get one "requests blocked" push per budget or limit and period, recorded in the background after the rejection is returned. Every 15 minutes a sweep warns once per period when a budget or key limit is about 80% used, from the hourly usage rollup, and says when a weekly or monthly limit runs out at the current pace. These alerts are push-only, on the money channel; no email is sent.
