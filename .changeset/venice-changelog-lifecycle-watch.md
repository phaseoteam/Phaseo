---
"@phaseo/gateway-api": patch
---

The provider model watcher now reads Venice's API changelog once an hour, alongside the official pricing pages. New additions, deprecations with their removal dates, removals, cancelled removals and price changes are matched to Phaseo's `venice` and `venice-e2ee` routes and sent as their own private model discovery messages, never truncated, with the action each route needs, such as setting an end date. Nothing is changed automatically. Unchanged changelog entries skip the route lookup, and the first run reports only lifecycle actions that are still open. The duplicate-alert check now hashes the full alert content rather than the truncated message, so a change past the cut is no longer skipped as a duplicate.
