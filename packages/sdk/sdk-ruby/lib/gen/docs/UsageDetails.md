# AIStatsSdk::UsageDetails

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **cached_tokens** | **Integer** |  | [optional] |
| **reasoning_tokens** | **Integer** |  | [optional] |
| **input_images** | **Integer** |  | [optional] |
| **output_images** | **Integer** |  | [optional] |
| **input_audio** | **Integer** |  | [optional] |
| **output_audio** | **Integer** |  | [optional] |
| **input_videos** | **Integer** |  | [optional] |
| **output_videos** | **Integer** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::UsageDetails.new(
  cached_tokens: null,
  reasoning_tokens: null,
  input_images: null,
  output_images: null,
  input_audio: null,
  output_audio: null,
  input_videos: null,
  output_videos: null
)
```

