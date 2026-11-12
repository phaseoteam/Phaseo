---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/cli": patch
---

Billing security fixes: requests are always charged their real cost (an overdrawn workspace is blocked until it tops up), self-serve refunds are checked and debited atomically in SQL, each Stripe refund and dispute is applied to the wallet once, one auto top-up runs at a time, auto top-up amounts must be $5 to $1,000,000, and a credit code can be redeemed once per workspace.
