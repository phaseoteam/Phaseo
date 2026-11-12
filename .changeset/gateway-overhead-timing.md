---
"@phaseo/gateway-api": patch
---

Phaseo overhead now measures only Phaseo's own time. Time spent on failed provider attempts before the one that answered is reported separately as `failover_ms` in the request's response timeline. The request clock now starts when the Worker receives the request, so authentication is counted. Successful non-streaming text requests record their generation time. An overhead that was never measured is stored as unknown, not 0 ms.
