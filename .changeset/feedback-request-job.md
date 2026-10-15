---
"@phaseo/gateway-api": minor
---

Add the daily feedback request job and email (off by default). When `FEEDBACK_REQUEST_EMAILS_ENABLED` is `"true"` and `FEEDBACK_REQUEST_FROM_EMAIL` is set, it queues up to 50 personal feedback emails a day for accounts at least 90 days old, sent with a reply-to address and RFC 8058 one-click unsubscribe. Recipients who unsubscribed from a Resend contact list are skipped, as are bounced, complained, and suppressed addresses. Feedback emails are drained after transactional email, at most five per outbox run, and stop offering the thank-you credit once `FEEDBACK_REWARD_CAP` codes have been issued. `sendEmail` now supports `replyTo` and custom headers.
