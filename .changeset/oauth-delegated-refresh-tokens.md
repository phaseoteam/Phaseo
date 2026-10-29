---
"@phaseo/gateway-api": minor
---

Apps that use "Sign in with Phaseo" now get a refresh token with their access token. The access token still lasts 7 days; the refresh token lasts 90 days from its last use and changes on every refresh. Refreshing gives the app's existing key a new secret, so the old access token stops working at once, and the key keeps its limits, history and place under Settings → Keys. A refresh never adds scopes. Using a refresh token twice ends the sign-in. Revoking the app or its key, turning the key off, or leaving the workspace ends refreshes, and revoking an app's access now also revokes its keys.
