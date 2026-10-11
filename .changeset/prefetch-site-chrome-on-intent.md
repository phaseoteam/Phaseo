---
"@phaseo/web": patch
---

Stop prefetching site chrome links when they scroll into view. The main navigation now prefetches on hover, focus or touch, and the header sign-up and cookie banner privacy links no longer prefetch. Every page rendered these links, so each crawler page view also rendered their destinations.
