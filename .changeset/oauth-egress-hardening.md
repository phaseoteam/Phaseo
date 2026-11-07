---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Sign-ins through the Phaseo CLI or desktop app no longer get an exemption on control routes that change where workspace content and events go or what can spend: those changes now return 403 and say to use the Phaseo dashboard or a management key. Apps that use Sign in with Phaseo, and CLI or desktop sign-ins, can no longer write presets (create, change including name and description, publish, label, fork, update from upstream, archive, or change the publisher handle), or create, change, deploy, attach keys to or delete a dynamic route; they can still read presets and routes. The account API (web-api) refuses the same writes for any OAuth client's token, and the Data API refuses preset writes from such tokens.

A preset reference (`@slug`) that matches more than one preset whose slugs differ only in case now returns `preset_ambiguous` instead of picking one, and new presets can no longer collide that way.

API key responses from the management API (list, get, create, update, rotate, cache invalidation and the current-key route) no longer include the key's `hash` or `kid`. Keys are identified by `id`; a hash saved from an older response is still accepted in the path.
