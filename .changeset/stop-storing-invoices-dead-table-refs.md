---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/gateway-api": patch
---

Stripe invoice events are acknowledged again instead of failing and being retried, because Phaseo no longer keeps its own copy of invoices; Stripe is the record. Opening an invoice document checks the invoice against the workspace's Stripe customer. Linking a private model to a catalogue model ID now checks the current model catalogue, so existing IDs are accepted again. The unused account recovery code routes are removed.
