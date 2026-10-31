# Phaseo Ruby SDK

Official Ruby SDK for Phaseo Gateway.

RubyGems package name: `phaseo_sdk`

## Installation

```ruby
gem "phaseo_sdk"
```

Then run:

```bash
bundle install
```

## Quick start

```ruby
require "phaseo_sdk"

client = PhaseoSdk::Phaseo.new(
  api_key: ENV.fetch("PHASEO_API_KEY"),
  base_path: ENV.fetch("PHASEO_BASE_URL", "https://api.phaseo.app/v1")
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

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `model_endpoint_capabilities` for live provider routes, or `check_model_parameters` to highlight unsupported, partially supported, unknown, and out-of-range values before submitting a request.

```ruby
report = client.check_model_parameters("openai/gpt-5.4", { "temperature" => 0.7 }, endpoint: "responses")
preflight = client.preflight_request({ "model" => "openai/gpt-5.4", "input" => "Hello", "temperature" => 0.7 }, endpoint: "responses")
```

`PageEnumerator` provides lazy offset pagination, and `JobHandle` refreshes or
waits for an existing job ID without resubmitting it.

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

## Realtime voice (beta)

`client.realtime.connect(...)` creates a realtime session and opens the relay WebSocket. It needs the optional `websocket` gem: `gem install websocket` or `gem "websocket"` in your Gemfile. Provider events pass through unchanged as Hashes.

```ruby
session = client.realtime.connect(model: "openai/gpt-realtime-2", voice: "marin")
session.on_warning { |warning| warn warning["code"] }
session.send_audio(pcm16_chunk) # PCM16 bytes; base64 is handled for you
ended = session.end(reason: "caller hung up") # session.ended: reason, usage, cost, billing_status
```

`session.each_event { |event| ... }` yields every event until the socket closes. If the socket closes without `session.ended`, `end` raises `PhaseoSdk::RealtimeSessionClosedError`, whose `final_bill_path` is the `GET /v1/generations?id=realtime%3A<session_id>` lookup for the final cost.

## Trusted workloads (OIDC tokens instead of an API key)

Workspaces in the trusted workloads beta can let GitHub Actions jobs and Vercel deployments call Phaseo with their short-lived OIDC token instead of an API key. Set up a trust policy in Settings → API Keys → Trusted workloads, then pass anything that responds to `call` as `api_key`. It is called before every request and retry, so each request uses a current token. Tokens must be issued for the audience `https://api.phaseo.app`.

The built-in helpers fetch the token and reuse it until a minute before it expires:

```ruby
# GitHub Actions: the job needs `permissions: id-token: write`.
client = PhaseoSdk::Phaseo.new(api_key: PhaseoSdk::WorkloadTokens.github_actions)

# Vercel: exchanges the deployment's OIDC token (VERCEL_OIDC_TOKEN, or the file named by
# VERCEL_OIDC_TOKEN_FILE) for one issued to Phaseo.
client = PhaseoSdk::Phaseo.new(api_key: PhaseoSdk::WorkloadTokens.vercel)

# In a request handler, pass the request's x-vercel-oidc-token header instead.
client = PhaseoSdk::Phaseo.new(
  api_key: PhaseoSdk::WorkloadTokens.vercel(token: -> { request.headers["x-vercel-oidc-token"] })
)
```

Both helpers take an optional `audience:`. Any other callable that returns a credential string works too. A blank result raises and the request is not sent. An `Authorization` header you pass to `request_with_response` is used as-is, without calling the provider.

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:ruby`
- Build gem: `pnpm --filter @phaseo/ruby-sdk run build`
- Test: `pnpm --filter @phaseo/ruby-sdk run test`
