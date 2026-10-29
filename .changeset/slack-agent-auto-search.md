---
"@phaseo/slack-agent": patch
"@phaseo/docs": patch
---

The Slack agent can search Slack with Auto. After a search, Auto requests carry `require_zero_data_retention` like any other, and the gateway's auto router then picks only among models with a provider that keeps no data (its classifier request carries the flag too). `ask_model` can ask Auto after a search. When zero data retention is what leaves Auto no model, the gateway refuses with `model_region_unavailable` and `unmet_requirements.zero_data_retention`, and the answer ends with the usual "no provider that keeps no data" message; other refusals get their usual message.
