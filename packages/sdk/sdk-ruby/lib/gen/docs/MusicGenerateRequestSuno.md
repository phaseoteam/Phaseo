# AIStatsSdk::MusicGenerateRequestSuno

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **prompt** | **String** |  | [optional] |
| **style** | **String** |  | [optional] |
| **title** | **String** |  | [optional] |
| **custom_mode** | **Boolean** |  | [optional] |
| **instrumental** | **Boolean** |  | [optional] |
| **persona_id** | **String** |  | [optional] |
| **model** | **String** |  | [optional] |
| **negative_tags** | **String** |  | [optional] |
| **vocal_gender** | **String** |  | [optional] |
| **style_weight** | **Float** |  | [optional] |
| **weirdness_constraint** | **Float** |  | [optional] |
| **audio_weight** | **Float** |  | [optional] |
| **call_back_url** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::MusicGenerateRequestSuno.new(
  prompt: null,
  style: null,
  title: null,
  custom_mode: null,
  instrumental: null,
  persona_id: null,
  model: null,
  negative_tags: null,
  vocal_gender: null,
  style_weight: null,
  weirdness_constraint: null,
  audio_weight: null,
  call_back_url: null
)
```

