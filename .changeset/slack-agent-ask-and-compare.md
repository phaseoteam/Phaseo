---
"@phaseo/slack-agent": minor
"@phaseo/web": patch
---

The Slack agent can ask another of the models allowed under **Model choice** for a second opinion while it answers (`ask_model`, up to 3 times an answer), and a message that starts with `compare <model>, <model>[, <model>]: <question>` is answered by each of those 2 or 3 models at once, in one reply with a section per model and its cost. Both count toward the answer's $0.50 limit (a compared model's share only decides whether it's asked), a comparison counts as one answer, and the footer names every model used. Names that can't be compared get the same private reply as `with <model>:`, before anything is counted. Settings → Slack mentions both under **Model choice**.
