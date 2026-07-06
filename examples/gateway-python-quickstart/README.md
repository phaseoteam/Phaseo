# Phaseo Gateway Python Quickstart

A standard-library Python example for control and generation surfaces on Phaseo Gateway.

## What It Supports

- Control:
  - `GET /v1/health`
  - `GET /v1/models`
  - `GET /v1/providers`
- Core generation:
  - `POST /v1/responses`
  - `POST /v1/chat/completions`
  - `POST /v1/embeddings`
  - `POST /v1/moderations`
  - `POST /v1/images/generations`
  - `POST /v1/ocr`
  - `POST /v1/videos`
  - `POST /v1/music/generate`
- Async status/control:
  - `GET /v1/videos/{video_id}`
  - `POST /v1/videos/{video_id}/cancel`
  - `POST /v1/videos/{video_id}/download_url`
  - `GET /v1/music/generate/{music_id}`

## Quick Start

1. Configure env:

```bash
cd examples/gateway-python-quickstart
cp .env.example .env.local
```

Set `PHASEO_API_KEY`.

2. Run a control-route smoke:

```bash
python quickstart.py smoke
```

3. Run chat over Responses API:

```bash
python quickstart.py responses --prompt "Return exactly: integration_ok"
```

4. Run full command help:

```bash
python quickstart.py --help
```

## Notes

- No third-party dependencies are required.
- `.env.local` is supported directly by the script.
- This is a REST fallback/reference example when SDK availability differs.
