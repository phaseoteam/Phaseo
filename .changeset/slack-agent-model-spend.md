---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Show the Slack agent's model spend on Settings → Slack: what its managed key spent on model requests this month, and in each month of the past charges table. It is billed from credits as normal requests and is not part of the Slack agent's own charge. The spend is summed in the database by the new `get_slack_agent_model_spend` function.
