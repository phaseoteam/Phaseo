---
"@phaseo/gateway-api": patch
---

Output speed has no speed limit or minimum window any more. A model that streams fast gets its real figure; output speed is left empty only when the whole answer arrived in a single network read, or when no time passed after the first token, because there is nothing to measure.
