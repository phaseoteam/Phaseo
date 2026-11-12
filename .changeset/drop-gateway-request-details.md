---
"@phaseo/gateway-api": patch
---

With workspace I/O logging on, the gateway no longer writes a request details row to the database for each captured request. The table was already gone from production, so every captured request made three failing inserts and logged an error. Nothing read it: the request log and Open in Chat read the I/O log. A request's content is now kept only in its I/O log, under the workspace's retention, so requests served by the regional endpoints, which have no I/O log storage, keep no content at all. A migration drops the table if it exists, so new databases match production.
