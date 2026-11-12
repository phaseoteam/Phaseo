---
"@phaseo/web": patch
---

Cut server work on model, home and compare pages. Model pages fetch one model's benchmark ranks instead of every leaderboard, "other models" fetch ten models, the home page fetches six models' prices instead of the gateway catalogue, and compare pages load the picker's model list in the browser when it opens. Compare pages now find every model they can compare, not only the first 1,000.
