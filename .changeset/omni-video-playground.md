---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

The video playground offers Gemini Omni's own sizes (360p to 4K) and durations (3 to 10 seconds), and Gemini Omni also accepts 16:9 and 9:16 pixel sizes such as 1280x720. The quickstart example on video model pages sends each model's own default duration and size instead of `duration_seconds`, which the API rejects.
