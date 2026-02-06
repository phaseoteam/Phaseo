# AIStatsSdk::Provider

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **api_provider_id** | **String** |  | [optional] |
| **api_provider_name** | **String** |  | [optional] |
| **description** | **String** |  | [optional] |
| **link** | **String** |  | [optional] |
| **country_code** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::Provider.new(
  api_provider_id: openai,
  api_provider_name: OpenAI,
  description: null,
  link: https://openai.com,
  country_code: US
)
```

