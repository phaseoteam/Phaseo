# AIStatsSdk::ProviderRoutingOptions

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **order** | **Array&lt;String&gt;** |  | [optional] |
| **only** | **Array&lt;String&gt;** |  | [optional] |
| **ignore** | **Array&lt;String&gt;** |  | [optional] |
| **include_alpha** | **Boolean** | Include alpha providers in routing (off by default). | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ProviderRoutingOptions.new(
  order: null,
  only: null,
  ignore: null,
  include_alpha: null
)
```

