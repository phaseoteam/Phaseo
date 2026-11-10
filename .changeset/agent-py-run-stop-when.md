---
"@phaseo/agent-sdk-py": patch
---

`run(stop_when=...)` and `continue_run(stop_when=...)` now override the agent definition's `stop_when`, as `stopWhen` does in TypeScript. Both arguments were accepted and ignored.
