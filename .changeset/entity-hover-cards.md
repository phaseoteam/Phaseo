---
"@phaseo/web": minor
"@phaseo/web-api": minor
---

Show an entity card when hovering any model, provider, organisation, app, benchmark, family, collection or country link, on public pages, the dashboard and chat. One card serves the whole page and links are recognised by their address. A new cached `/entity-cards/<kind>/<id>` endpoint returns each compact card, and the usage tables now use these cards instead of their own.
