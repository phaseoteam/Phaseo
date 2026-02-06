# AIStatsSdk::PricingBreakdown

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **total_nanos** | **Integer** |  | [optional] |
| **total_usd_str** | **String** |  | [optional] |
| **total_cents** | **Integer** |  | [optional] |
| **currency** | **String** |  | [optional] |
| **lines** | **Array&lt;Hash&lt;String, Object&gt;&gt;** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::PricingBreakdown.new(
  total_nanos: null,
  total_usd_str: null,
  total_cents: null,
  currency: null,
  lines: null
)
```

