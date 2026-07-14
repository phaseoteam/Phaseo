# Phaseo Gateway OAuth + Full Surface Integration (Next.js)

This example is a complete external integration reference for Phaseo Gateway:

- OAuth 2.1 + PKCE login
- Session-backed token storage and refresh
- Unified gateway proxy for control + generation routes
- Model discovery (`/models`)
- Chat app powered by the Responses API
- Endpoint tester for non-chat surfaces

If you do not need OAuth, use `examples/web-chat-nextjs` for a simpler API-key chat integration.
If you need a script-first integration, use `examples/gateway-node-quickstart`.

## What This Example Covers

### Control routes

- `GET /health`
- `GET /models`
- `GET /providers`
- Any `control/*` route via the proxy allowlist

### Generation routes

- `POST /chat/completions`
- `POST /responses`
- `POST /messages`
- `POST /embeddings`
- `POST /moderations`
- `POST /audio/speech`
- `POST /audio/transcriptions`
- `POST /audio/translations`
- `POST /images/generations`
- `POST /images/edits`
- `POST /videos`
- `GET/DELETE /videos/{id}`
- `POST /videos/{id}/cancel`
- `POST /videos/{id}/download_url`
- `GET /videos/{id}/content`
- `POST /ocr`
- `POST /music/generate`
- `GET /music/generate/{id}`

## Architecture

- `app/api/gateway/[...surface]/route.ts`
  - Catch-all proxy route for allowed gateway surfaces
  - Injects OAuth bearer token from session
  - Refreshes token if expired
  - Forwards request/response body and status

- `app/dashboard/GatewayWorkbench.tsx`
  - Fetches control route data
  - Discovers model IDs
  - Runs chat via `POST /responses`
  - Includes generic endpoint tester for all other surfaces

## Quick Start

1. Install dependencies:

```bash
cd examples/oauth-client-nextjs
npm install
```

2. Configure env:

```bash
cp .env.example .env.local
```

3. Fill required values in `.env.local`:

- `NEXT_PUBLIC_OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `NEXT_PUBLIC_AISTATS_URL`
- `NEXT_PUBLIC_REDIRECT_URI`
- `SESSION_SECRET`
- `NEXT_PUBLIC_GATEWAY_URL` (recommended: `https://api.phaseo.app`)

4. Run:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000), sign in, then use the dashboard.

## Complete Chat Flow (Models API + Responses API)

The chat app flow in this example is:

1. Fetch models from `/api/gateway/models`
2. Let user choose model
3. Send prompt to `/api/gateway/responses`
4. Reuse `previous_response_id` for conversational continuity
5. Render `output_text` (or fallback-parsed output content)

## SDK Guidance (Published and Unpublished)

If a language SDK is unavailable or behind the latest API behavior:

- Keep OAuth/session logic the same
- Call gateway REST endpoints directly through the same contract:
  - Base: `https://api.phaseo.app/v1`
  - Auth: `Authorization: Bearer <PHASEO_API_KEY or OAuth token>`
- Preserve response shapes used by your app

## Files

- `app/page.tsx` - OAuth entry page
- `app/dashboard/page.tsx` - protected shell
- `app/dashboard/GatewayWorkbench.tsx` - full integration UI
- `app/api/gateway/[...surface]/route.ts` - unified proxy
- `lib/oauth.ts` - OAuth + PKCE + refresh
- `lib/session.ts` - encrypted session storage

## Notes

- This app is intentionally external-gateway focused.
- It avoids internal build or codegen workflows.
- The proxy has an allowlist for safety; extend it as needed for additional surfaces.
