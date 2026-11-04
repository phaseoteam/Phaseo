---
"@phaseo/gateway-api": patch
---

Always charge finished batch and video jobs, into overdraft when the hold and balance do not cover the actual cost. Hold batch rows for every requested choice (`n`, `best_of`, `candidateCount`), and reject choice counts above 128. Charge what an abandoned stream has generated 15 and 25 seconds after the client disconnects, so a drain stopped by the runtime is still billed; the final charge takes only the rest.
