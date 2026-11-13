---
"@phaseo/agent-sdk-py": patch
---

A tool timeout on a tool with `on_error="return-to-model"` now goes back to the model as a tool error instead of failing the run, as in TypeScript. Python cannot stop the timed-out tool's thread; the run stops waiting for it.
