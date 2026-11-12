---
"@phaseo/web": minor
"@phaseo/web-api": patch
---

Link consented PostHog analytics to signed-in users (user ID, workspace group and sign-up date only), hide API keys, signing secrets and TOTP secrets from session replay, link server errors to the visitor's replay, record zero-balance survey answers in PostHog Surveys, and emit a one-time first-usage event for the first-request survey. The account header now returns the user's sign-up date, and the privacy policy describes the account linking.
