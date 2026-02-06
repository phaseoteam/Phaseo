# AIStatsSdk::ModelPricing

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **pricing_plan** | **String** |  | [optional] |
| **meters** | [**ModelPricingMeters**](ModelPricingMeters.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModelPricing.new(
  pricing_plan: standard,
  meters: null
)
```

