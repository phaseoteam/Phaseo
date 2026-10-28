---
"@phaseo/slack-agent": patch
"@phaseo/docs": patch
---

Once a Slack agent answer has searched Slack, every further model request it makes goes only to providers with zero data retention. That covers its own steps, the models it asks with `ask_model` and the images it makes, including after a retried run or a question's answer. Auto is never asked after a search. Search is offered only when the answer's model has a route that keeps no data (by its provider's policy or the route's own, as the gateway reads it), that the agent's guardrail allows and that the agent's key can use. Auto can't promise one, so it doesn't search. Otherwise the agent says search isn't available with this model, names the allowed models that could search, or says an admin can choose one. If the gateway still finds no such provider after a search, the answer ends with a clear message and its cost so far counts. A model that `ask_model` can't use after a search returns a tool error that says why. The Slack agent guide explains this in all nine languages.
