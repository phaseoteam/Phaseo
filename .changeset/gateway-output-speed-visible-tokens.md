---
"@phaseo/gateway-api": patch
---

Output speed now counts only the tokens streamed after the first visible token. Reasoning a model did before its answer is left out, a response that arrived in one burst or at an impossible speed records no output speed instead of a misleading one, and a server-tool response is measured over its last provider round.
