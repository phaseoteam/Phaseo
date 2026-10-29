---
"@phaseo/gateway-api": minor
---

Apps that use "Sign in with Phaseo" now get a refresh token with their access token. The access token still lasts 7 days; the refresh token lasts 90 days from its last use and changes on every refresh. Refreshing gives the app's existing key a new secret, so the old access token stops working at once, and the key keeps its limits, history and place under Settings → Keys. Approving the same app again renews that key the same way instead of adding a second one, and never turns a paused key back on. A refresh never adds scopes, and losing a scope the key needs ends refreshes for good. Using a refresh token twice ends the sign-in. Revoking the app or its key, turning the key off, or leaving the workspace ends refreshes, and revoking an app's access now also revokes its keys, paused ones included. Revoking a refresh token at `/oauth/revoke` ends the key and every refresh token from that sign-in in one step.
