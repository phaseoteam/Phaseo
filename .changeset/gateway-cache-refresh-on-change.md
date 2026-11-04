---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

The gateway now refreshes its cached copy of an API key whenever the key changes, however the change was made. A revoked, deleted or deprovisioned key stops working within about a minute, including when it was removed through SCIM or a Slack uninstall. A key deleted while it was in use can no longer stay cached as active.
