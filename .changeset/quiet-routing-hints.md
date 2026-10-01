---
"@phaseo/gateway-api": patch
---

Coalesce unchanged advisory routing hints within each Worker isolate for up to one minute, while publishing provider changes and retrying failed writes. Keep local hints current and prevent slow cache reads from overwriting newer completions. Remote hint expiry may precede the latest local activity by at most one minute; billing, authorization and health accounting are unchanged.
