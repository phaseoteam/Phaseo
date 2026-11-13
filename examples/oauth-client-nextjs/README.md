# Phaseo OAuth Gateway Workbench (Next.js)

A Next.js app where people sign in with Phaseo and use the Gateway with their own workspace credits:

- OAuth 2.1 authorization code flow with PKCE (S256), `state` and `iss` checks
- Endpoints discovered from `https://api.phaseo.app/.well-known/oauth-authorization-server`
- Tokens kept server-side in an encrypted, httpOnly session cookie, refreshed and rotated automatically
- Sign-out that revokes the app's key at Phaseo
- One server-side proxy with an allowlist of the Gateway paths the app uses
- Model discovery, chat over the Responses API, and an endpoint tester

If you don't need sign-in, use `examples/web-chat-nextjs` for an API-key chat app.
For a script, use `examples/gateway-node-quickstart`.

## How sign-in works

| Step | Endpoint |
| --- | --- |
| Discovery | `GET https://api.phaseo.app/.well-known/oauth-authorization-server` |
| Authorize | `GET https://api.phaseo.app/oauth/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256` |
| Token | `POST https://api.phaseo.app/oauth/token` (form-encoded), `grant_type=authorization_code` or `refresh_token` |
| Who signed in | `GET https://api.phaseo.app/oauth/userinfo` |
| Sign out | `POST https://api.phaseo.app/oauth/revoke` with the refresh token |

- **Scope.** The app asks for `openid email profile gateway:access`. `gateway:access` is required for third-party apps: it lets the token call the Gateway and spend credits in the workspace the person picks on the consent screen. `openid email profile` let the app read the person's name and email from `/oauth/userinfo`.
- **Client authentication.** A confidential app (the default) sends its secret with HTTP Basic auth (`client_secret_basic`). A public app leaves `PHASEO_OAUTH_CLIENT_SECRET` empty and relies on PKCE.
- **Access token.** It's an opaque Gateway key, not a JWT, valid for `expires_in` seconds (7 days). Send it as `Authorization: Bearer` to `https://api.phaseo.app/v1`.
- **Refresh.** Every refresh returns a new access token and refresh token, and the old ones stop working at once. Using a refresh token twice ends the sign-in, so `lib/oauth.ts` shares one refresh between parallel requests. That de-duplication is in memory: run one server process, or move it to shared storage.
- **Spending limit.** The person sets a monthly limit for your app on the consent screen ($20.00 by default). Once it's spent, Gateway requests return `429` with `key_limit_exceeded`.

## Register an OAuth app

1. In Phaseo, open **Settings → OAuth Apps** and create an app (or use the [OAuth clients API](https://phaseo.app/docs/v1/api-reference/endpoint/oauth-clients-create)).
2. Add the redirect URI `http://localhost:3000/auth/callback`. Redirect URIs must match exactly, and must use HTTPS except for `localhost`, `127.0.0.1` or `::1` callbacks during development.
3. Keep the default scopes, which include `openid`, `profile`, `email` and `gateway:access`.
4. Copy the client ID and, for a confidential app, the client secret. The secret is shown only when it's created or regenerated.

## Run it

```bash
cd examples/oauth-client-nextjs
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | Value |
| --- | --- | --- |
| `PHASEO_OAUTH_CLIENT_ID` | Yes | The OAuth app's client ID |
| `PHASEO_OAUTH_CLIENT_SECRET` | Confidential apps | The OAuth app's client secret |
| `PHASEO_OAUTH_REDIRECT_URI` | Yes | `http://localhost:3000/auth/callback`, exactly as registered |
| `SESSION_SECRET` | Yes | A random string of at least 32 characters, for example from `openssl rand -base64 32` |
| `PHASEO_API_URL` | No | Defaults to `https://api.phaseo.app`. OAuth is discovered from it and the Gateway is at `/v1` |
| `GATEWAY_APP_TITLE` | No | Sent as `x-title` for app attribution |
| `GATEWAY_HTTP_REFERER` | No | Sent as `http-referer` for app attribution |

All of these are read on the server only. Never put the client secret or session secret in a `NEXT_PUBLIC_` variable.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, pick a workspace on the consent screen, and use the dashboard.

## Chat flow

1. Fetch models from `/api/gateway/models`.
2. Send the prompt to `/api/gateway/responses` with the chosen model.
3. Resend the whole conversation in `input` on every turn. The Gateway doesn't store responses, so it rejects `previous_response_id`.
4. Show `output_text`, or the text parts of `output`.

## Proxy allowlist

`app/api/gateway/[...surface]/route.ts` forwards to `https://api.phaseo.app/v1/<path>` only for:

- `health`, `models`, `providers`
- `responses`
- `embeddings`, `moderations`, `images/generations`, `ocr`
- `videos` and `videos/<id>/...`, `music/generate` and `music/generate/<id>`

Everything else returns `400 invalid_surface`. Keep the list to the paths your product calls; each entry is a path the browser can reach with the person's key.

## Files

| File | Does |
| --- | --- |
| `app/page.tsx` | Sign-in page; shows sign-in errors |
| `app/api/auth/start/route.ts` | Builds the authorize URL and stores the PKCE verifier and state |
| `app/auth/callback/route.ts` | Checks `state` and `iss`, exchanges the code, reads `/oauth/userinfo` |
| `app/api/auth/signout/route.ts` | Revokes the refresh token, then clears the session |
| `app/dashboard/page.tsx` | Protected shell |
| `app/dashboard/GatewayWorkbench.tsx` | Status, model discovery, Responses chat and endpoint tester |
| `app/api/gateway/[...surface]/route.ts` | Allowlisted Gateway proxy |
| `app/api/chat/route.ts` | Fixed `POST /v1/chat/completions` proxy, for apps that only need chat |
| `lib/oauth.ts` | Discovery, PKCE, code exchange, refresh, revoke, userinfo |
| `lib/gateway.ts` | Allowlist, token refresh and request forwarding |
| `lib/session.ts` | Encrypted session storage |

## Before you ship it

- Trim the allowlist to the paths you call, and replace the endpoint tester with purpose-built flows.
- Use HTTPS redirect URIs in production.
- If you run more than one server instance, move the refresh de-duplication in `lib/oauth.ts` to shared storage, or a parallel refresh can end the sign-in.
