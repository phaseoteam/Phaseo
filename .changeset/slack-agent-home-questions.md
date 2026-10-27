---
"@phaseo/slack-agent": minor
"@phaseo/docs": patch
---

The Slack agent can ask the person a question with buttons when it needs a choice or an approval: a short question and 2 to 5 options, optionally with Other for an answer in their own words. Only the person it's answering can answer (others get a private note), and a reply in the thread also counts. The answer pauses, waits up to an hour in a Cloudflare Workflow, and continues from where it stopped; it stays one answer, and the 12-step and $0.50 limits span the whole of it. Slack's stop button still works while it waits. The app also gets a Home tab showing how to use the agent, its model, whether the person's Phaseo account is connected (with the Connect button) and, for linked members, this month's answers. The manifest adds `app_home_opened` and turns on the Home tab, and the Slack agent guide describes both in every language.
