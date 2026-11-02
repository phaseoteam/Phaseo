---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

I/O logs no longer store image, audio or file bytes. Placeholders replace them, image URLs are kept, and Open in Chat leaves out media that wasn't stored and says so.
