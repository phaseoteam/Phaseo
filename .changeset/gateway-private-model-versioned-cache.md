---
"@phaseo/gateway-api": patch
---

Requests after a quiet spell are faster: the gateway keeps its record of a workspace's private models until they change, instead of re-reading it every minute. Private model edits still take effect within about a minute.
