# AIStatsSdk::ModelPricingMeters

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **input_text_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **input_image_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **input_image** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **input_video_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **input_audio_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **input_audio_seconds** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **output_text_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **output_image_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **output_image** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **output_audio_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **output_audio_seconds** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **web_search** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **cached_read_text_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |
| **cached_write_text_tokens** | [**ModelPricingMeter**](ModelPricingMeter.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModelPricingMeters.new(
  input_text_tokens: null,
  input_image_tokens: null,
  input_image: null,
  input_video_tokens: null,
  input_audio_tokens: null,
  input_audio_seconds: null,
  output_text_tokens: null,
  output_image_tokens: null,
  output_image: null,
  output_audio_tokens: null,
  output_audio_seconds: null,
  web_search: null,
  cached_read_text_tokens: null,
  cached_write_text_tokens: null
)
```

