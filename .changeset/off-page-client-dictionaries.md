---
"@phaseo/web": patch
---

Stop embedding client translation dictionaries in every page. Pages now reference a content-addressed dictionary file that browsers load once and cache, while server-rendered HTML keeps every translated string.
