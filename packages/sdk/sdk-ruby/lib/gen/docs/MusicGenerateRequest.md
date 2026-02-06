# AIStatsSdk::MusicGenerateRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **prompt** | **String** |  | [optional] |
| **duration** | **Integer** |  | [optional] |
| **format** | **String** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |
| **suno** | [**MusicGenerateRequestSuno**](MusicGenerateRequestSuno.md) |  | [optional] |
| **elevenlabs** | [**MusicGenerateRequestElevenlabs**](MusicGenerateRequestElevenlabs.md) |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::MusicGenerateRequest.new(
  model: null,
  prompt: null,
  duration: null,
  format: null,
  provider: null,
  suno: null,
  elevenlabs: null,
  debug: null
)
```

