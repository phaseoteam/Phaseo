---
"@phaseo/slack-agent": minor
---

The Slack agent now answers. Each turn runs as a Cloudflare Workflow. It streams the answer into the Slack thread through the gateway, with the installation's managed key, model and instructions, and adds a footer with the model and the turn's cost. Every request asks for providers that don't keep or train on data, and is labelled `app=slack-agent`. Retried steps update the same Slack message instead of posting again. Stop and Cancel end a turn between steps. Out-of-credits, spending-limit and unavailable-model errors become plain replies. Linked workspace members can ask about the workspace's spend, credit balance, key usage and models in direct messages, or in channels the admins allow. Two new database functions add the spend up per day, week or month and per API key.
