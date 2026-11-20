---
"@phaseo/sdk": patch
---

`getGeneration()` now returns `Promise<GenerationResponse>`, so fields such as `model_id` and `cost_nanos` are typed without a cast.
