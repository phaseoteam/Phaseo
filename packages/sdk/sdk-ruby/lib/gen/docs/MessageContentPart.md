# AIStatsSdk::MessageContentPart

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::MessageContentPart.openapi_one_of
# =>
# [
#   :'AudioContentPart',
#   :'ImageContentPart',
#   :'TextContentPart',
#   :'ToolCallContentPart',
#   :'VideoContentPart'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::MessageContentPart.build(data)
# => #<AudioContentPart:0x00007fdd4aab02a0>

AIStatsSdk::MessageContentPart.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `AudioContentPart`
- `ImageContentPart`
- `TextContentPart`
- `ToolCallContentPart`
- `VideoContentPart`
- `nil` (if no type matches)

