---
"@phaseo/web": minor
"@phaseo/web-api": minor
---

Show request classifications in Logs and Usage. The label filter lists classifier dimensions by name with their allowed values, even before any request carries them, alongside the caller's own labels and classifier spend; Logs can also filter to a label key with any value, or exclude a value or key. Usage adds a "Usage by label" table (requests, success, tokens and spend per value of any label key, summed in the database by the new `get_private_usage_label_breakdown` RPC), which also shows what classifier calls cost by classifier. The request detail gets a Classifications section with each classifier's answers, confidence, status, model, cost and a link to the classifier call. Members get classifier names, keys and allowed values only; configuration stays admin-only.
