# AI Stats Ruby SDK

Official Ruby SDK for AI Stats Gateway.

RubyGems package name: `ai_stats_sdk`

## Installation

```ruby
gem "ai_stats_sdk"
```

Then run:

```bash
bundle install
```

## Quick start

```ruby
require "ai_stats_sdk"

client = AIStatsSdk::AIStats.new(
  api_key: ENV.fetch("AI_STATS_API_KEY"),
  base_path: ENV.fetch("AI_STATS_BASE_URL", "https://api.phaseo.app/v1")
)

response = client.create_response(
  model: "google/gemma-3-27b:free",
  input: "Reply with: Ruby SDK works"
)

puts response["id"]
```

## Common methods

- `create_response(payload)`
- `create_chat_completion(payload)`
- `list_models(options = {})`
- `get_model_deprecation_info(model_id)`
- `validate_model(model_id)`

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:ruby`
- Build gem: `pnpm --filter @ai-stats/ruby-sdk run build`
- Test: `pnpm --filter @ai-stats/ruby-sdk run test`
