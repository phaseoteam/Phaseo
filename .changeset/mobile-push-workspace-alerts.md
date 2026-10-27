---
"@phaseo/gateway-api": minor
---

Send workspace alerts to the Phaseo mobile app. Owners and admins get pushes for low balance (once per drop, re-armed when a credit lifts the balance above the alert threshold), failed auto top-ups, expiring cards, rate-limit throttling, model substitutions and deprecations, and API key activity: keys created, rotated, deleted, paused and resumed, and exposed keys. A key's creator also hears about their own key. Pushes name the workspace when the recipient belongs to several, say "You …" to the person who acted, use the money, traffic, security and deprecations channels, respect quiet hours (exposed keys excepted) and never count towards the daily cap. API keys issued through OAuth, and keys paused or resumed through the control API, are now recorded in the workspace audit log as such.
