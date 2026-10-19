---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
---

Add the weekly "Your Phaseo week" mobile push. At 18:00 on Sunday in each device's time zone, owners and admins with notifications and the digest category on get one push for the week, summed over every workspace they own or administer: "Your Phaseo week: $42.18 spent, up 12%", with requests, tokens, the top model and the new models their rules match ("Acme and 2 other workspaces: …" when they have several workspaces). A week with no usage but matching releases says "A quiet week: 6 new models launched, including …"; a week with neither sends nothing. It goes to the `digest` channel, waits for quiet hours, never counts against the daily cap, and opens `/account/week?workspace=<id>&week=<YYYY-Www>`. The app's "Your week" screen reads `GET /api/account/settings/mobile-notifications/week`: the week's and the previous week's totals, the seven days, the top five models and the matching releases, for one workspace.
