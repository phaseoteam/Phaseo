---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Request classifiers can use any text or decision model. The gateway picks how to ask from what the model's providers support. Text models with structured outputs get a strict JSON schema, as before. Decision models get a `decisions` request with one choice question per dimension (one yes/no question per value for multi-value dimensions), using the model's own probabilities as confidence. Other text models are asked for the same JSON in the prompt; the answer is read even when it is wrapped in a code fence or a sentence. A schema request that is refused with a 400 or 422 is retried once as prompted JSON. The settings model picker now lists every text and decision model and shows which format the chosen model uses, and the settings test run uses the same format.
