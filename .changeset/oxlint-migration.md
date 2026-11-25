---
"@phaseo/web": patch
"@phaseo/desktop": patch
---

Lint with oxlint instead of ESLint, with accessibility rules in the web app. Fix the issues those rules found: the realtime voice picker marks the chosen voice with `aria-pressed`, the shared image component always passes its alt text, and blog cover images no longer say "cover image" in their alt text.
