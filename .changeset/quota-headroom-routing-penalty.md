---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
"@phaseo/docs": patch
---

Routing eases traffic off a provider as it approaches a declared rate limit instead of switching it off at the limit. The limit coordinator projects each window's use from what isolates report they have used, and shortens leases near a limit so unused allowance is returned sooner. This removes the per-minute traffic swings and most of the requests that were sent over a limit.
