---
"@phaseo/slack-agent": patch
---

A Slack agent answer that posts a chart or an image, or publishes a page, and then ends without any text (for example when asked for "no other commentary") now finishes as a normal answer: no "Sorry, something went wrong" message, the usual model and cost footer under it, and it counts as an answer. A page the model didn't link is linked in the reply. An empty model reply with nothing posted still gets the error message.
