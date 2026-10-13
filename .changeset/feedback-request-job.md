---
"@phaseo/gateway-api": minor
---

Add the daily feedback request job and email (off by default). When `FEEDBACK_REQUEST_EMAILS_ENABLED` is `"true"` and `FEEDBACK_REQUEST_FROM_EMAIL` is set, it queues up to 50 personal feedback emails a day for accounts at least 90 days old, sent with a reply-to address and RFC 8058 one-click unsubscribe. `sendEmail` now supports `replyTo` and custom headers.
