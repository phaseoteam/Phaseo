---
"@phaseo/web": patch
---

Allow Phaseo to request microphone permission for Realtime and Chat audio recording. Previously the site-wide Permissions-Policy blocked capture before the browser could ask for consent. Camera and location access remain disabled, and microphone access remains restricted to the same origin.
