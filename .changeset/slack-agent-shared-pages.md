---
"@phaseo/slack-agent": minor
"@phaseo/web-api": minor
"@phaseo/web": patch
---

The Slack agent can publish a static web page (a report, a table or a chart, in HTML and CSS with inline SVG) with `publish_page` and link it in its reply. Scripts, links, forms and anything loaded from elsewhere are taken out before a page is kept, and again before it is shown, so a page can't run scripts or send anything anywhere. An answer that has searched Slack publishes no page. Pages are served from `slack.phaseo.app/p/…` in a sandboxed frame that runs no scripts and can't load anything or navigate away, open to anyone with the link or, where Sign in with Slack is set up for the app, only to members of the Slack workspace (checked again every 10 minutes while a sign-in lasts). They are kept 7, 30 (default) or 90 days and deleted at expiry and on uninstall; each answer can publish 3 and each installation keeps 200, at no extra charge. People from other organisations can't publish. Settings → Slack has a **Shared pages** section: turn pages off, choose how long new ones are kept and who can view them, and open or delete published pages.
