# AIStatsSdk::VideoGenerationRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **prompt** | **String** |  |  |
| **seconds** | [**VideoGenerationRequestSeconds**](VideoGenerationRequestSeconds.md) |  | [optional] |
| **size** | **String** |  | [optional] |
| **input_reference** | **String** |  | [optional] |
| **input_reference_mime_type** | **String** |  | [optional] |
| **duration** | **Integer** |  | [optional] |
| **duration_seconds** | **Integer** |  | [optional] |
| **ratio** | **String** |  | [optional] |
| **aspect_ratio** | **String** |  | [optional] |
| **resolution** | **String** |  | [optional] |
| **negative_prompt** | **String** |  | [optional] |
| **sample_count** | **Integer** |  | [optional] |
| **seed** | **Integer** |  | [optional] |
| **person_generation** | **String** |  | [optional] |
| **output_storage_uri** | **String** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::VideoGenerationRequest.new(
  model: null,
  prompt: null,
  seconds: null,
  size: null,
  input_reference: null,
  input_reference_mime_type: null,
  duration: null,
  duration_seconds: null,
  ratio: null,
  aspect_ratio: null,
  resolution: null,
  negative_prompt: null,
  sample_count: null,
  seed: null,
  person_generation: null,
  output_storage_uri: null,
  debug: null,
  provider: null
)
```

