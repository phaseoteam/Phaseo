# AIStatsSdk::MusicGenerateRequestElevenlabs

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **prompt** | **String** |  | [optional] |
| **composition_plan** | **Object** |  | [optional] |
| **music_length_ms** | **Integer** |  | [optional] |
| **model_id** | **String** |  | [optional] |
| **force_instrumental** | **Boolean** |  | [optional] |
| **store_for_inpainting** | **Boolean** |  | [optional] |
| **with_timestamps** | **Boolean** |  | [optional] |
| **sign_with_c2pa** | **Boolean** |  | [optional] |
| **output_format** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::MusicGenerateRequestElevenlabs.new(
  prompt: null,
  composition_plan: null,
  music_length_ms: null,
  model_id: null,
  force_instrumental: null,
  store_for_inpainting: null,
  with_timestamps: null,
  sign_with_c2pa: null,
  output_format: null
)
```

