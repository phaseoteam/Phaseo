---
"@phaseo/agent-sdk-py": patch
---

Stop conditions now run after every step, including steps that called tools, so `stop_when` can end a run that keeps calling tools and can match on `tool_calls`. The run stops with the step's reply as its output, as in TypeScript.
