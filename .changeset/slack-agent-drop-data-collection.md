---
"@phaseo/slack-agent": patch
"@phaseo/docs": patch
---

The Slack agent no longer sends `provider.data_collection: "deny"`, which the gateway rejects with a 400, so answers no longer fail on every request. The installation's Slack agent guardrail still decides which providers may serve it.
