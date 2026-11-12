---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/web": patch
"@phaseo/sdk": minor
---

Lay the groundwork for spend rules. Workspaces gain a billing time zone (`spend.billing_time_zone` in the control API's notification settings and in account settings, an IANA name, default `UTC`) for the calendar periods of spend rules and spend reports, and three new routable notification kinds: `spend_alert`, `spend_blocked` and `spend_report`. They can be routed to destinations now; nothing sends them yet. The database adds the spend rule tables (rules, their destinations, fired state, blocks and the evaluation queue), capped at 50 rules per workspace.
