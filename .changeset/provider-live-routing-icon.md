---
"@phaseo/web": patch
---

Show live routing next to a provider's status on model pages: an orange icon while the gateway is temporarily limiting a provider after repeated failures, and a blue one while it lets a few requests through to check recovery. Each has its own hover card that explains it is automatic and separate from the status Phaseo sets by hand, which now reads "Lower priority" instead of "Rate limited". The provider statuses guide explains both in every language.
