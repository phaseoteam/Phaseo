---
"@phaseo/gateway-api": patch
---

With workspace I/O logging on, the gateway no longer writes request, response or provider payloads into its request details rows in the database. A request's content is kept only in its I/O log, under the workspace's retention, so requests served by the regional endpoints, which have no I/O log storage, keep no content at all. The details rows still record the request's metadata. Nothing read the payload columns: the request log and Open in Chat read the I/O log.
