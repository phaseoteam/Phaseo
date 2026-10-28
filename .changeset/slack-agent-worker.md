---
"@phaseo/slack-agent": minor
"@phaseo/web-api": patch
---

Add the Slack agent's Cloudflare Worker (`apps/slack`). It verifies and acknowledges Slack events and button clicks for the hosted app and for a company's own app, ignores bots, and dedupes Slack's retries. A meter per installation decides who gets an answer under the installation's limits and counts each month's people and answers for billing. A coordinator per Slack thread runs one turn at a time and deletes its working memory after 7 days. Unlinked people get a Connect account button when the installation requires linked accounts. Removing the app inside Slack uninstalls it in Phaseo: its gateway key is deleted, its guardrail removed and the change recorded in the audit log. Turns are acknowledged but not answered yet. The Slack secrets format now comes from one shared module used by web-api and the Worker.
