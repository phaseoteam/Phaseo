---
"@phaseo/agent-sdk": patch
---

Checkpoint serial approved/manual tool continuation before each effect and after each confirmed result. Preserve unfinished decisions and deferred human messages through failure or cancellation, and expose an execution start marker for reviewing uncertain effects on resume.

Propagate cancellation even when ordinary tool errors return to the model, preserving interrupted actions for recovery.
