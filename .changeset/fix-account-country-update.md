---
"@phaseo/web": patch
---

Fix account country changes by using a scoped profile update instead of an upsert that attempts to write the protected user ID.
