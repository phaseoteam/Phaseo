---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Speed up admin page loads. A new lightweight hidden-models endpoint replaces the full model audit source on `/chat`, `/models`, and the header search. The admin chat model list now loads in a single batched request instead of one request per hidden model.
