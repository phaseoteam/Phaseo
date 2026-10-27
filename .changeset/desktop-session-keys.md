---
"@phaseo/gateway-api": minor
---

The Phaseo desktop app signs in with a Phaseo login and gets its key for model calls from `POST /oauth/desktop/key`, with no consent screen. It renews that key at `POST /oauth/desktop/renew` (30 days from each renewal), so a sign-in lasts while the app is used.
