---
"@phaseo/web": minor
"@phaseo/web-api": patch
---

Forecast API key limits. The keys list and key detail page now project each daily, weekly and monthly window from its pace so far, show when a key is on course to hit its limit, and draw usage, projection and limit with one shared meter. Weekly and monthly key usage now comes from the gateway's UTC window totals instead of reading as zero, and limit reset countdowns use UTC boundaries rather than the viewer's local midnight.
