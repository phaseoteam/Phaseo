---
"@phaseo/gateway-api": patch
---

`GET /v1/models/me` now works with an OAuth access token (a CLI or app sign-in). It lists the models allowed by the signed-in person's rules: the workspace's, their departments' and their own. Before, it failed with a 500.
