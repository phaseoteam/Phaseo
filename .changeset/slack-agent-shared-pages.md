---
"@phaseo/slack-agent": minor
"@phaseo/web-api": minor
"@phaseo/web": patch
---

The Slack agent can publish a shared web page (a report, a table, a chart or a small interactive view) with `publish_page` and link it in its reply. Pages are served from `slack.phaseo.app/p/…` in a sandboxed frame that can't load anything from elsewhere or navigate away, open to anyone with the link or, where Sign in with Slack is set up for the app, only to members of the Slack workspace (checked again every 10 minutes while a sign-in lasts). They are kept 7, 30 (default) or 90 days and deleted at expiry and on uninstall; each answer can publish 3 and each installation keeps 200, at no extra charge. People from other organisations can't publish. Settings → Slack has a **Shared pages** section: turn pages off, choose how long new ones are kept and who can view them, and open or delete published pages.
