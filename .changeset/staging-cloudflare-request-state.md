---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Add an isolated staging prototype for published Cloudflare request context,
durable key revocation, and transactional inference/hold accounting, with
database-free preflight diagnostics. Add opt-in website mutation fencing,
background synchronization through existing billing functions, and durable
lifecycle repositories with workspace-scoped recovery. Production behavior
remains unchanged; published-workspace dispatch remains gated pending full
policy and lifecycle integration.
