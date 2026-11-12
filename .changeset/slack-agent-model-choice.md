---
"@phaseo/slack-agent": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
---

The Slack agent can answer a message with a model the person chooses: admins turn on **Model choice** in Settings → Slack and allow up to 10 catalogue models (and Auto, with Auto Routing), and a message that starts with `with <model>:` is answered by that model. A model that isn't allowed gets a private reply listing the choices, and isn't counted. The reply footer now links each model's name to its Phaseo page and the cost to that answer's requests in Logs.
