---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Fix the lifecycle alerts page crashing when a workspace has deprecation warnings, and tidy the model retirement banner: it is centred with its dismiss button pinned to the right edge, wraps cleanly, says models are being retired, and names the model that retires first so a red (critical) banner explains itself. The alerts page drops the time range and refresh controls, which had no effect on its data, keeps every model you use visible, and collapses only models you don't use behind a chevron. Lifecycle warnings are only critical when a retirement date is within 7 days; a deprecation date alone tops out at warning.
