---
"@phaseo/gateway-api": patch
---

Data contributions no longer keep any image, audio or file bytes. Every data URL, bare base64 string and provider media field is replaced with a placeholder before storage.
