# AIStatsSdk::Usage

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **prompt_tokens** | **Integer** |  | [optional] |
| **completion_tokens** | **Integer** |  | [optional] |
| **total_tokens** | **Integer** |  | [optional] |
| **prompt_tokens_details** | [**UsageDetails**](UsageDetails.md) |  | [optional] |
| **completion_tokens_details** | [**UsageDetails**](UsageDetails.md) |  | [optional] |
| **input_tokens** | **Integer** |  | [optional] |
| **output_tokens** | **Integer** |  | [optional] |
| **input_tokens_details** | [**UsageDetails**](UsageDetails.md) |  | [optional] |
| **output_tokens_details** | [**UsageDetails**](UsageDetails.md) |  | [optional] |
| **input_text_tokens** | **Integer** |  | [optional] |
| **output_text_tokens** | **Integer** |  | [optional] |
| **cached_read_text_tokens** | **Integer** |  | [optional] |
| **cached_write_text_tokens** | **Integer** |  | [optional] |
| **reasoning_tokens** | **Integer** |  | [optional] |
| **pricing** | [**PricingBreakdown**](PricingBreakdown.md) |  | [optional] |
| **pricing_breakdown** | [**PricingBreakdown**](PricingBreakdown.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::Usage.new(
  prompt_tokens: null,
  completion_tokens: null,
  total_tokens: null,
  prompt_tokens_details: null,
  completion_tokens_details: null,
  input_tokens: null,
  output_tokens: null,
  input_tokens_details: null,
  output_tokens_details: null,
  input_text_tokens: null,
  output_text_tokens: null,
  cached_read_text_tokens: null,
  cached_write_text_tokens: null,
  reasoning_tokens: null,
  pricing: null,
  pricing_breakdown: null
)
```

