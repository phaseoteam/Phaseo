---
"@phaseo/web-api": patch
"@phaseo/slack-agent": patch
"@phaseo/web": patch
---

Phaseo staff can see every Slack agent installation at Internal → Slack agent: the Phaseo workspace, Slack team, status, hosted or company app, install and uninstall dates, and this UTC month's people, answers, estimated Slack agent charge and model spend through the installation's key, all summed in the database by the new service-only `list_slack_agent_installations`. When a workspace installs the agent, or uninstalls it in Phaseo settings or inside Slack, a short alert goes to the internal Discord channel in `DISCORD_SIGNUP_WEBHOOK_URL` (names and ids only, email masked). The alert is optional, runs after the response and never fails an install or uninstall.
