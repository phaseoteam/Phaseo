---
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Signed-in clients can no longer read request logs' web search details directly from the database, so the owners-and-admins contents setting holds everywhere. The website now enforces its frame, plugin and base-URL content security policy instead of only reporting it, and request and audit log page cursors must be a timestamp and an id.
