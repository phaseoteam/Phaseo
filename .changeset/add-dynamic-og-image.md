---
"@phaseo/web": minor
---

Add a public dynamic Open Graph image endpoint at `/og/dynamic?title=…&description=…&pathname=…` in the Phaseo OG style. Inputs are limited to known params, short Latin text without links, and are checked against a profanity filter; rejected requests return an uncached 400.
