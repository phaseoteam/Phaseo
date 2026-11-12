---
"@phaseo/gateway-api": minor
"@phaseo/web": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
---

The models API returns `parameter_specs`: every request parameter a provider accepts on an endpoint, in one standard shape whatever way the catalogue stores it. Each spec gives the allowed `values` (with labels for voices and presets), `min`/`max`/`step`, `default`, aliases, file and dimension limits, sub-fields, and `when` rules for values that depend on other parameters (for example, Veo durations at 1080p). It is on every provider entry of `GET /v1/models/{author}/{slug}/endpoints` and `GET /v1/videos/models`, and on `GET /v1/models` offers with `?include=parameter_specs`. The playground reads video sizes and durations and speech and realtime voices from the same specs.
