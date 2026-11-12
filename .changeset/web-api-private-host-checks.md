---
"@phaseo/web-api": patch
---

Notification destination and provider catalogue URLs now use the same private-address check as webhooks, which also blocks shared and benchmark IPv4 ranges and IPv6 forms that wrap a private IPv4 address.
