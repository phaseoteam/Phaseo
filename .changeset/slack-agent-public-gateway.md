---
"@phaseo/slack-agent": patch
---

The Slack agent calls the gateway's public URL instead of a service binding, so its requests carry a country and providers that refuse an unknown country (OpenAI, Anthropic and others) can answer.
