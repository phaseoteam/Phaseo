---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Add an isolated staging prototype for published Cloudflare request context,
durable key revocation, and transactional inference/hold accounting, with
database-free preflight diagnostics. Add opt-in website mutation fencing,
non-replenishing test escrow projection, and durable lifecycle repositories.
Production behavior remains unchanged; paid escrow dispatch is gated pending
completion of admission and lifecycle recovery.
