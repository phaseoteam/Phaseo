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
- `list_organisations(options = {})` for paginated `/organisations` discovery
- `list_pricing_models(options = {})` for `/pricing/models` catalogue pricing discovery
- `calculate_pricing(payload)` for `/pricing/calculate` usage estimation
- `list_providers(options = {})`, `get_credits(options = {})`, `get_activity(options = {})`, and `get_analytics(options = {})` for provider discovery and management-key usage surfaces
- `list_api_keys(options = {})` for management-key `/keys` discovery
- `create_api_key(payload)`, `update_api_key(id, payload)`, and `delete_api_key(id)` for management-key API-key lifecycle changes
- `get_api_key(id)` for management-key `/keys/{id}` lookup
- `list_workspaces(options = {})`, `get_workspace(id)`, `create_workspace(payload)`, `update_workspace(id, payload)`, and `delete_workspace(id)` for management-key workspace lifecycle management
- `get_current_api_key`
- `health`
- `get_model_deprecation_info(model_id)`
- `validate_model(model_id)`

Model discovery supports the public `/gateway/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability: "all"` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability: "all"` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```ruby
models = client.list_models(
  provider: "anthropic",
  provider_status: "beta,not_ready",
  provider_availability_reason: "preview_only,provider_not_ready",
  capability_status: "coming_soon,internal_testing",
  availability: "all",
)
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.

```ruby
batch_socket_url = client.batch_websocket_url("batch_123", interval_ms: 1500)
video_socket_url = client.video_websocket_url("video_123", close_on_terminal: true)
generic_socket_url = client.get_async_job_websocket_url("video", "video_123")
resource_socket_url = client.async_jobs.websocket_url("video", "video_123")

puts batch_socket_url
puts video_socket_url
puts generic_socket_url
puts resource_socket_url
```

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
