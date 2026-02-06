# AIStatsSdk::ListModelsOrganisationParameter

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ListModelsOrganisationParameter.openapi_one_of
# =>
# [
#   :'Array<OrganisationId>',
#   :'OrganisationId'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ListModelsOrganisationParameter.build(data)
# => #<Array<OrganisationId>:0x00007fdd4aab02a0>

AIStatsSdk::ListModelsOrganisationParameter.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `Array<OrganisationId>`
- `OrganisationId`
- `nil` (if no type matches)

