---
"@phaseo/gateway-api": patch
---

Output speed now counts only the tokens generated after the first streamed output. Hidden reasoning a model did before its first streamed output is left out, while streamed reasoning still counts. A response that arrived in one burst or at an impossible speed records no output speed instead of a misleading one, and a server-tool response is measured over its last provider round.
