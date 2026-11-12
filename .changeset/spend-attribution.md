---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/web": patch
"@phaseo/sdk": minor
---

Attribute workspace spend to people and departments for the coming spend rules. The 15-minute usage rollup now records who made each request (the key's creator, or the OAuth user), workspaces gain a department spend attribution setting (`all` departments a person belongs to, or the `primary` one only), and notification settings in the control API and account settings expose it as `spend.department_attribution`. Usage overview totals are unchanged.
