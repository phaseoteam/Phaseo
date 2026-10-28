---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Fix model deprecation alerts, which never matched a workspace. A workspace that turned them on now gets one notice per model, as soon as a model it called in the last 30 days is marked deprecated or retiring, counted by the model it requested rather than the one that served it. The owner is emailed and the workspace's routed destinations are notified; a new setting also emails admins. The usage page's deprecation warnings use the same lookup.
