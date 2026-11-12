---
"@phaseo/gateway-api": patch
---

Realtime voice billing is safer around deploys and price changes. A call cut by a deploy is billed only up to the provider's last activity and settles within about two minutes. Each call keeps the price it started with. Usage with no price fails into review instead of being billed at $0. A billing review with complete evidence now settles itself, for every provider, and unblocks the key.
