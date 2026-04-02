# AI Stats Gateway Node Quickstart

A zero-dependency Node.js script that exercises control + generation surfaces on the external gateway.

## What It Calls

- `GET /v1/health`
- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`

## Quick Start

1. Configure env:

```bash
cd examples/gateway-node-quickstart
cp .env.example .env.local
```

Set `AI_STATS_API_KEY`.

2. Run smoke mode (control routes only):

```bash
npm run smoke
```

3. Run full quickstart:

```bash
npm run start
```

## Notes

- This is a REST fallback example when an SDK is not available or when you want to validate raw gateway behavior.
- The script supports `.env.local` without extra dependencies.
