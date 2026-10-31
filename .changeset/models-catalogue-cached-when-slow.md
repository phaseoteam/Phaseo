---
"@phaseo/web-api": patch
"@phaseo/web": patch
---

The full model catalogue no longer times out its gateway data on most requests: the enrichment deadline is 6 seconds instead of 2, and if it is still missed the response is cached at the edge for a minute instead of being rebuilt on every request. Requests waiting on the same catalogue now each get their own copy of the response, and the private model editor and pricing calculator ask for the catalogue without gateway data they do not use.
