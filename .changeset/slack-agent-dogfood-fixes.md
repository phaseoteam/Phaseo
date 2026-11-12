---
"@phaseo/slack-agent": patch
"@phaseo/web-api": patch
"@phaseo/docs": patch
---

Slack agent fixes from testing it in a real Slack workspace. `recall` asked with words that are about the list rather than in it ("to-do", "tasks") now shows the newest notes instead of an empty memory, and its description says to list to-dos or pins by kind alone. Charts and images no longer get described as "above" the reply, since they can land before or after it. A `compare <model>, <model>: …` message while model choice is off gets a private reply saying Compare is off and how an admin turns it on, instead of one model's answer that reads as a comparison; ordinary text starting with "Compare …:" is still answered as written. Installing the agent now checks the `slack_agent` rollout gate (or a Phaseo admin) on the server too, as Settings → Slack already does; updating an installed agent's Slack permissions doesn't.
