---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
---

Add `locate` decision questions, which return the verbatim spans of a string input that match a description, each with `start` and `end` offsets in Unicode code points and a `score`. Locate is opt-in per route: only routes whose `decisions.make` capability sets `params.locate` serve it, and other models return a 400 that names the supporting models. It needs a plain string `state` or `input` with no images, audio or video, and takes only `instructions`. Perplexity Decider V1.3 and Decider Flash V1.3 support it.
