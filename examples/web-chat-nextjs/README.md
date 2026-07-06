# Phaseo Gateway Web Chat Example (Next.js)

This example is a minimal chat product integration using:

- Model discovery from `GET /v1/models`
- Conversation generation from `POST /v1/responses`
- Server-side API key handling via local API routes

## Quick Start

1. Install:

```bash
cd examples/web-chat-nextjs
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Set:
- `PHASEO_API_KEY`
- `NEXT_PUBLIC_GATEWAY_URL` (recommended `https://api.phaseo.app`)

3. Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Files

- `app/api/models/route.ts` - server proxy for `/v1/models`
- `app/api/responses/route.ts` - server proxy for `/v1/responses`
- `app/components/ChatClient.tsx` - chat UI + model selector
- `lib/gateway.ts` - gateway contract helpers and request headers

## Why This Example Exists

Use this when OAuth is not required and you want the fastest path to a production-style chat integration with the external gateway contract.
