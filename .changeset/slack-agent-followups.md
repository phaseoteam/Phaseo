---
"@phaseo/slack-agent": patch
"@phaseo/web-api": patch
"@phaseo/docs": patch
---

The Slack agent now reads the newest part of a long thread instead of its first 15 messages. Each answer makes one `conversations.replies` read that ends at the message being answered and starts from the newest messages the thread already knows (in a channel, from the last 30 minutes at most). It always keeps the thread's first message, says when a busy thread held more than Slack returned, and merges the read with its own earlier replies. The agent no longer asks Slack for `files:read` or `search:read.public`, which nothing used; installs keep them until they're reinstalled. When anyone can use the agent, someone who isn't linked and asks about usage where usage data is allowed now gets the private Connect your Phaseo account button, at most once per person in each thread, and still gets an answer. The Slack agent guide covers all three in nine languages.
