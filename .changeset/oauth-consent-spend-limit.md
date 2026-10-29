---
"@phaseo/gateway-api": minor
"@phaseo/web": minor
---

When you sign in to another app with Phaseo and let it use the Gateway, the consent screen now asks for a monthly spending limit for that app. It starts at $20.00 a month; you can type another amount or choose No limit. The limit becomes the monthly cost limit of the key the app gets, so the gateway stops the app's requests once it has spent that much from the team's credits in the calendar month. You can change it later under Settings → API Keys; the app itself can't, even with permission to manage keys.
