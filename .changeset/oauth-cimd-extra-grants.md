---
"@phaseo/gateway-api": patch
---

OAuth client metadata documents that list grant types Phaseo doesn't offer are now accepted, as long as they include the authorization code grant. Claude's custom connectors failed to sign in with `invalid_client` because Claude's document also lists the JWT bearer grant.
