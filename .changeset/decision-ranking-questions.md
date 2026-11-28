---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
---

Decision requests in the state format accept a `ranking` question, which orders its options best first, or returns only the best `top_k`. Any model whose routes return a probability for each choice option answers it: the gateway asks the model which option is best and orders the options by probability. Together Tev and Respan Span-01 return a 400. The answer lists the option keys in order and the probability that each option is the best one. The model watcher now also checks Liquid AI's decision models list and pricing page.
