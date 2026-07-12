# Phaseo Raycast Extension

Browse Phaseo models and providers, then check usage and activity directly from Raycast.

## Features

- **Browse Models**: Search models, then press Enter to open the canonical Phaseo model page
- **Explore Organisations**: Browse model organisations and open their Phaseo pages
- **View Providers**: Browse API providers and open their Phaseo pages or upstream documentation
- **Usage & Credits**: Check current balance and recent usage with a management API key
- **Usage by Model**: See 30-day gateway spend and request volume by model and provider
- **Recent Gateway Activity**: Browse recent gateway requests with a management API key

## Setup

1. Install the extension in Raycast
2. Get your API key from [Phaseo](https://phaseo.app)
3. Configure catalogue commands with your Phaseo API key in preferences
4. Create a **Raycast** management key in **Phaseo Settings → Management Keys** and add it for Usage & Credits, Usage by Model, and Recent Gateway Activity

## Development

```bash
# From this directory
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
```

On first run, Raycast prompts each user for their own Phaseo API key. It is
stored as a Raycast password preference and is sent only as the Bearer token
for requests to the configured Phaseo API URL. The account commands prompt for
an optional, separate `phaseo_v1_mk_...` management API key; this key is not
used for catalogue requests.

## Requirements

- Raycast (macOS or Windows)
- Phaseo API key
- Internet connection

## License

MIT
