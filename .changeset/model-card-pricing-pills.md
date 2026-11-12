---
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Show list prices with units on model card pricing pills. The catalogue API now sends a structured headline price that excludes cache, batch and pass-through meters, keeps the billed time unit, and covers every meter in the hover card. The card localises it as, for example, "$3 in · $15 out / 1M tokens", "From: $0.04 / image" or "Free".
