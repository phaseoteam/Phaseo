---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
---

Decision requests in the state format accept a `ranking` question, which orders its options best first, or returns only the best `top_k`. Every decision model answers it: the gateway asks the model which option is best and orders the options by probability. The answer lists the option keys in order and the probability that each option is the best one. The model watcher now also checks Liquid AI's decision models list and pricing page.
