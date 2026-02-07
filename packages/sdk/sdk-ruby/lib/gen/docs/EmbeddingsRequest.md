# AIStatsSdk::EmbeddingsRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  | [optional] |
| **input** | [**OneOfstringarray**](OneOfstringarray.md) |  | [optional] |
| **inputs** | [**OneOfstringarray**](OneOfstringarray.md) | Alias for input. | [optional] |
| **encoding_format** | **String** |  | [optional] |
| **dimensions** | **Integer** |  | [optional] |
| **embedding_options** | **Object** |  | [optional] |
| **user** | **String** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::EmbeddingsRequest.new(
  model: null,
  input: null,
  inputs: null,
  encoding_format: null,
  dimensions: null,
  embedding_options: null,
  user: null,
  provider: null
)
```

