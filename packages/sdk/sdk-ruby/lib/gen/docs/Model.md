# AIStatsSdk::Model

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model_id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **release_date** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **organisation_id** | **String** |  | [optional] |
| **aliases** | **Array&lt;String&gt;** |  | [optional] |
| **endpoints** | **Array&lt;String&gt;** |  | [optional] |
| **input_types** | **Array&lt;String&gt;** |  | [optional] |
| **output_types** | **Array&lt;String&gt;** |  | [optional] |
| **providers** | [**Array&lt;ModelProvidersInner&gt;**](ModelProvidersInner.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::Model.new(
  model_id: null,
  name: null,
  release_date: null,
  status: null,
  organisation_id: null,
  aliases: null,
  endpoints: null,
  input_types: null,
  output_types: null,
  providers: null
)
```

