---
"@phaseo/slack-agent": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
"@phaseo/docs": patch
---

The Slack agent can search Slack for the person asking. `search_slack` uses Slack's real-time search with the action token Slack sends with the message, so it finds only what that person can see, in public channels (and files shared there), and the model links every message it uses. It is offered where `slack_installations.search_mode` allows it (direct messages only by default, or channels too, or off, under **Slack search** in Settings → Slack), to members of the organisation who aren't guests, once Slack has granted the new `search:read.public` and `search:read.files` scopes (**Update Slack permissions**). Results are never stored: working memory keeps the query and count, a run waiting on a question is kept without them, and the action token is dropped with the turn. Slack allows this API only for apps in its directory and for a company's own apps, so the hosted app can search once its Slack Marketplace listing is approved. The Slack agent guide describes it in every language.
