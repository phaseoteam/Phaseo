---
"@phaseo/gateway-api": patch
---

Add a Google AI Studio Decisions executor for Google's pre-release Decisions API (`POST /v1beta/decisions`). It maps Phaseo noul, choice and score questions, text, image, audio and video input to Google's request and validates the calibrated answers through the shared Decisions path. Box questions, generation controls and `safety_identifier` are rejected locally. A blocked input returns a content-policy error. No route is enabled until a Google Decisions model is added to the catalogue. Decisions providers can now turn a response with no answers into their own client error.
