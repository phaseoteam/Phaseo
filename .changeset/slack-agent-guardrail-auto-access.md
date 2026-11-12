---
"@phaseo/web-api": patch
"@phaseo/web": patch
"@phaseo/slack-agent": patch
"@phaseo/docs": patch
---

The Slack agent can answer with most models again. Its **Slack agent** guardrail still turns off training on paid and free models and prompt publishing, but now allows providers that keep logs without training on them; before, it left about 150 of 1,021 models with a route, and none from OpenAI or Anthropic. The agent's key still stores no content in Phaseo. A migration updates the guardrails of live installations, and the database still stops anyone turning training or prompt publishing back on while the agent is installed.

Settings → Slack offers **Auto** only where the workspace has Auto Routing, decided the way the gateway decides it for the agent's key. Everyone else picks a specific model, with GPT-6 Luna (`openai/gpt-6-luna`) preselected, and web-api refuses `phaseo/auto` on install or when switching to it without access (`auto_routing_unavailable`). An install that doesn't name a model gets GPT-6 Luna. When the gateway refuses the agent's model for its key, the agent now says in Slack that the model isn't available to it and an admin can choose another in Phaseo settings. The Slack agent guide and the app's description say the same in nine languages.
