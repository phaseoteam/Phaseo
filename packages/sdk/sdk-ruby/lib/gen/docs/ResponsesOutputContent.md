# AIStatsSdk::ResponsesOutputContent

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **type** | **String** |  | [optional] |
| **text** | **String** |  | [optional] |
| **annotations** | **Array&lt;Object&gt;** |  | [optional] |
| **image_url** | [**AnthropicContentBlockImageUrlOneOf**](AnthropicContentBlockImageUrlOneOf.md) |  | [optional] |
| **b64_json** | **String** |  | [optional] |
| **mime_type** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesOutputContent.new(
  type: null,
  text: null,
  annotations: null,
  image_url: null,
  b64_json: null,
  mime_type: null
)
```

