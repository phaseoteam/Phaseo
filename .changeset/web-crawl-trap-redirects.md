---
"@phaseo/web": patch
---

Redirect old model sub-paths, such as `/models/openai/gpt-5/benchmarks`, with a real 308 before rendering, and disallow query-string `/compare?` and `/chat?` URLs in robots.txt so crawlers stop rendering one page per model and locale.
