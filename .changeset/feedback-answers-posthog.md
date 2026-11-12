---
"@phaseo/web-api": patch
---

Send feedback page answers to the PostHog survey "90-day feedback email" instead of storing them in the database. The answers must reach PostHog before the response is recorded and a thank-you code is issued; if PostHog is unavailable the page shows an error and nothing is recorded. Only the survey's questions and reasons are accepted.
