# AIStatsSdk::GetCredits200ResponseCredits

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **remaining** | **Integer** | Current credit balance in nanos | [optional] |
| **thirty_day_usage** | **Integer** | Credits consumed in the last 30 days (nanos) | [optional] |
| **thirty_day_requests** | **Integer** | Number of API requests in the last 30 days | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::GetCredits200ResponseCredits.new(
  remaining: 15000000000,
  thirty_day_usage: 250000000,
  thirty_day_requests: 1250
)
```

