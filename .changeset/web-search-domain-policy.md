---
"@phaseo/gateway-api": patch
---

The `phaseo:web_search` tool's `allowed_domains` and `excluded_domains` are now enforced. The model can narrow the allowed domains and add exclusions, but can no longer search outside the tool's allowed domains or drop its exclusions. A model call whose allowed domains fall entirely outside the tool's returns a `domains_blocked_by_domain_policy` tool error.
