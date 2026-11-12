---
"@phaseo/slack-agent": patch
---

The Slack agent no longer takes other bots' and apps' messages in a thread for its own. Only its installation's bot user, or its own Slack app, is "You" in the prompt; other bots and apps are shown as "Another app", with their name when Slack gives one. When Slack answers a thread read with 429, the installation's meter keeps the `Retry-After`, and every thread in that installation skips its read and works from its working memory until it has passed, instead of asking Slack again.
