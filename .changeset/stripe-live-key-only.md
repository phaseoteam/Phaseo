---
"@phaseo/web": patch
"@phaseo/gateway-api": patch
---

Use only the live Stripe secret key. The website and gateway no longer fall back to `TEST_STRIPE_SECRET_KEY`, and the production website refuses a test-mode key, so checkout can never open in a Stripe sandbox. The web deploy now takes `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Infisical (prod `/web`) and fails if either is missing or the key isn't live.
