---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

The video playground reads each model's sizes, durations and defaults from the catalogue instead of a fixed list, so a model offers the options stored for it (Gemini Omni: 360p to 4K, 3 to 10 seconds). Gemini Omni also accepts 16:9 and 9:16 pixel sizes such as 1280x720. The quickstart example on video model pages sends a duration and size instead of `duration_seconds`, which the API rejects.
