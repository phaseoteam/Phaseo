---
"@phaseo/desktop": patch
---

Open replies with very long tables faster (tables of 150 rows or more are parsed in pieces), search chat history and messages up to four times faster, and draw only the visible rows of a Code sidebar with 60 or more active chats. Adds `pnpm --filter @phaseo/desktop perf`, a performance suite that measures startup, memory, idle CPU, interactions, parallel streaming, the store and the bundle, and compares a run with an earlier one.
