---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
---

Add rule-based mobile push notifications for the Phaseo app. Account settings gain mobile notification preferences (master switch, quiet hours, daily cap), Expo device registration, notify and mute rules by event, lab, provider, model and modality, and a rate-limited test push. A new gateway job, off unless `MOBILE_PUSH_ENABLED` is `true`, turns catalogue changes into release, Phaseo availability, price change, deprecation and new provider notifications and sends them through Expo. The public model announcer no longer fails a whole batch when a claimed model has turned private.
