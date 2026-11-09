---
"@phaseo/web": patch
"@phaseo/mobile": patch
---

Model uptime always shows the three per-attempt rates, Reachable, Accepted and Completed, on the website and in the mobile app. The single request-level uptime line is gone. A model with no traffic in the last 24 hours used to fall back to that line; it now shows three flat 100% lines with "No failures", because hours without data count as 100%.

Provider uptime is per attempt only. The provider table, the provider card's daily and hourly bars, and the mobile provider rows and sheet no longer fall back to request-level uptime. A provider with traffic but no rated attempts shows 100%, and so does any day or hour without attempts. A provider with no traffic in the last three days still shows no uptime.
