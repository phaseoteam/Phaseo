---
"@phaseo/web": patch
---

Reject POSTs to page URLs that carry no server action before they render, and turn off Partial Prefetching so pages no longer render and embed a second runtime prefetch copy.
