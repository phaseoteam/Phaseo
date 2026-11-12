---
"@phaseo/web-api": patch
---

Add the Slack agent's settings API: install it into Slack with OAuth (hosted app or a company's own Slack app), save its limits and behaviour, pause or uninstall it, and link Slack people to their Phaseo accounts. Each installation gets a hidden gateway key with an optional monthly limit and a guardrail that turns off training, prompt publishing and providers that log prompts. Bot tokens, the gateway key and app secrets are stored encrypted and never returned. Nothing is live until the Slack secrets are set.
