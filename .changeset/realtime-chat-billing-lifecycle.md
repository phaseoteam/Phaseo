---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
"@phaseo/data-catalog": patch
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
---

Fix Realtime Chat authentication and session setup, preserve cached-token billing across normalization, and show database-backed session holds and final charges in Chat and Realtime Sessions logs.

Correct the current OpenAI Realtime price cards and refresh generated model suggestions to remove expired MiniMax free routes. Model request fields continue to accept arbitrary string IDs; this catalogue refresh does not remove request operations or change their wire format.
