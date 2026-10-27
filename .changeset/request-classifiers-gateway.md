---
"@phaseo/gateway-api": minor
---

Run request classifiers in the gateway. After a chat completions, responses, or messages request succeeds, each enabled classifier in scope labels it with the workspace's own model and credentials, in the background before the request is logged, so the answers are stored as ordinary request labels and can be filtered and grouped in logs, usage, and analytics. Caller-sent labels win; classifier calls are billed at the model's normal price, labelled `phaseo.classifier`, not classified themselves, and do not count against rate limit policies. Monthly budgets pause a classifier for the rest of the month, session sampling reuses a session's answers, and `REQUEST_CLASSIFIERS_ENABLED=false` turns classification off.
