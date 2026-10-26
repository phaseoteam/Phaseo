---
"@phaseo/gateway-api": minor
---

The Phaseo desktop app can ask for the same account access as the CLI, and renews its own key at `POST /oauth/desktop/renew` (30 days from each renewal) so a sign-in lasts while the app is used.
