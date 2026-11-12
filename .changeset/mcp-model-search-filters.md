---
"@phaseo/mcp": minor
---

`models_list` can now filter by output type (including embeddings), by request parameters every provider must support (such as tools, structured output or reasoning), by release date and by lifecycle, and can sort by release date. With required parameters, prices and providers come only from offers that support all of them, so a cheaper provider that can't serve the request no longer sets the price. Models with an unknown release date are left out of release-date filters rather than assumed recent. Results now include each model's maximum output tokens and lifecycle status.
