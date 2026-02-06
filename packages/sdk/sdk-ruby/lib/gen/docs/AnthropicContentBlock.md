# AIStatsSdk::AnthropicContentBlock

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **type** | **String** |  | [optional] |
| **text** | **String** |  | [optional] |
| **cache_control** | [**CacheControl**](CacheControl.md) |  | [optional] |
| **source** | [**AnthropicContentBlockSource**](AnthropicContentBlockSource.md) |  | [optional] |
| **image_url** | [**AnthropicContentBlockImageUrl**](AnthropicContentBlockImageUrl.md) |  | [optional] |
| **input_audio** | [**AudioContentPartInputAudio**](AudioContentPartInputAudio.md) |  | [optional] |
| **video_url** | **String** |  | [optional] |
| **id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **input** | **Object** |  | [optional] |
| **tool_use_id** | **String** |  | [optional] |
| **content** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::AnthropicContentBlock.new(
  type: null,
  text: null,
  cache_control: null,
  source: null,
  image_url: null,
  input_audio: null,
  video_url: null,
  id: null,
  name: null,
  input: null,
  tool_use_id: null,
  content: null
)
```

